// SPDX-License-Identifier: Apache-2.0

import { parseOpenRPCDocument } from '@open-rpc/schema-utils-js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

import openRpcData from '../../../../docs/openrpc.json';
import CallerContract from '../contracts/Caller.json';
import LogsContract from '../contracts/Logs.json';
import {
  chainId,
  gasLimit,
  gasPrice,
  sendAccountAddress,
  setCreateContractLegacyTransactionAndBlockHash,
  setCurrentBlockHash,
  setLegacyTransactionAndBlockHash,
  setTransaction1559AndBlockHash,
  setTransaction2930AndBlockHash,
} from './data/conformity/utils/constants';
import { checkRequestBody } from './data/conformity/utils/overwrites';
import {
  createContractLegacyTransaction,
  legacyTransaction,
  transaction1559,
  transaction2930,
} from './data/conformity/utils/transactions';
import { getLatestBlockHash, sendRequestToRelay, signAndSendRawTransaction } from './data/conformity/utils/utils';
import { checkResponseFormat, findSchema, isResponseValid } from './data/conformity/utils/validations';

const directoryPath = path.resolve(__dirname, '../../../../node_modules/execution-apis/tests');
const overwritesDirectoryPath = path.resolve(__dirname, 'data/conformity/overwrites');
const relayUrl = 'http://127.0.0.1:7546';
const wsRelayUrl = 'ws://127.0.0.1:8546';

const ajv = new Ajv({ strict: false });
addFormats(ajv);
let relayOpenRpcData: any;

function splitReqAndRes(content: any) {
  /**
   * Splits a given input string into distinct segments representing the request, the response, and optional wildcard fields.
   *
   * @param {string} content - The input string to be segmented.
   * @returns {{ request: string, response: string, wildcards: string[] }} - An object containing the separated request, response strings, and wildcard fields.
   */
  const lines = content
    .split('\n')
    .map((line: any) => line.trim())
    .filter((line: any) => line.length > 0);
  const wildcards: string[] = []; // Add explicit type annotation here

  const requestLine = lines.find((line: any) => line.startsWith('>>'));
  const responseLine = lines.find((line: any) => line.startsWith('<<'));
  const wildcardLine = lines.find((line: any) => line.startsWith('## wildcard:'));

  if (wildcardLine) {
    wildcards.push(
      ...wildcardLine
        .replace('## wildcard:', '')
        .trim()
        .split(',')
        .map((field: any) => field.trim()),
    );
  }

  if (!requestLine || !responseLine) {
    throw new Error('Missing or improperly formatted request/response lines');
  }

  return {
    request: requestLine.slice(2).trim(),
    response: responseLine.slice(2).trim(),
    wildcards,
  };
}

async function processFileContent(directory: any, file: any, content: any) {
  /**
   * Processes a file from the execution apis repo
   * containing test request and response data.
   *
   * @param {string} file - The name of the file being processed.
   * @param {Object} content - The content of the file, consisting of request and response data.
   * @returns {Array<string>} - An array of missing keys in the response data.
   */
  console.log('Executing for ', file);
  console.log('Original request:', content.request);
  const modifiedRequest = await checkRequestBody(relayUrl, file, JSON.parse(content.request));
  console.log('Modified request:', JSON.stringify(modifiedRequest));

  const needError = JSON.parse(content.response).error;
  console.log(`Error expected in response: ${!!needError}`);

  const response = await sendRequestToRelay(relayUrl, modifiedRequest, needError);
  console.log('Response from relay:', JSON.stringify(response));

  const schema = findSchema(directory);
  console.log(`Schema found for directory "${directory}": ${!!schema}`);

  const wildcards = content.wildcards || [];
  console.log('Wildcards being used:', JSON.stringify(wildcards));

  if (needError) {
    console.log('Validating an error response.');
    const valid = checkResponseFormat(response.response.data, content.response, wildcards);
    console.log(
      `Inside processFileContent, valid: ${valid}, response: ${JSON.stringify(
        response.response.data,
      )}, content: ${JSON.stringify(content)}, wildcards: ${JSON.stringify(wildcards)}`,
    );
    expect(valid).to.be.false;
    console.log('Error response validation finished.');
  } else {
    console.log('Validating a success response.');
    if (schema && wildcards.length === 0) {
      console.log('Using schema validation.');
      const valid = isResponseValid(schema, response);
      console.log(`Schema validation result: ${valid}`);
      expect(valid).to.be.true;
      if (response.result) {
        console.log('Comparing response result with expected result.');
        expect(response.result).to.be.equal(JSON.parse(content.response).result);
      }
    } else {
      console.log('Using response format check (key-by-key comparison).');
      const hasMissingKeys = checkResponseFormat(response, JSON.parse(content.response), wildcards);
      console.log(`Missing keys check result: ${hasMissingKeys}`);
      expect(hasMissingKeys).to.be.false;
    }
    console.log('Success response validation finished.');
  }
}

const synthesizeTestCases = function (testCases: any, updateParamIfNeeded: any) {
  for (const testName in testCases) {
    it(`${testName}`, async function () {
      const isErrorStatusExpected: boolean =
        (testCases[testName]?.status && testCases[testName].status != 200) ||
        !!JSON.parse(testCases[testName].response).error;
      const schema = relayOpenRpcData.methods.find((method: any) => method.name === testName)?.result?.schema;
      try {
        const req = updateParamIfNeeded(testName, JSON.parse(testCases[testName].request));
        const res = await sendRequestToRelay(relayUrl, req, false);
        const hasMissingKeys: boolean = checkResponseFormat(res, JSON.parse(testCases[testName].response));

        if (schema && schema.pattern) {
          const check = isResponseValid(schema, res);
          expect(check).to.be.true;
        }

        expect(hasMissingKeys).to.be.false;
        expect(isErrorStatusExpected).to.be.false;
      } catch (e: any) {
        expect(isErrorStatusExpected).to.be.true;
        expect(e?.response?.status).to.equal(testCases[testName].status);
      }
    });
  }
};

/**
 * To run the Ethereum Execution API tests as defined in the repository ethereum/execution-apis, it’s necessary
 * to execute them against a specifically configured node. This node must use:
 *  - Transactions from the blocks in chain.rlp (https://github.com/ethereum/execution-apis/blob/main/tests/chain.rlp),
 *  - Account balances from genesis.json (https://github.com/ethereum/execution-apis/blob/main/tests/genesis.json).
 *
 * We cannot replay all the chain.rlp transactions directly, as they are already signed with a chain id
 * that exceeds Java’s Integer.MAX_VALUE (which is also the maximum allowed chain ID in Hedera).
 * However, we can replicate the test environment by deploying the required smart contracts manually.
 * While these contracts will receive different addresses than those in the original tests,
 * their behavior will remain consistent with the expectations.
 */
const initGenesisData = async function () {
  for (const data of require('./data/conformity/genesis.json')) {
    const options = { maxPriorityFeePerGas: gasPrice, maxFeePerGas: gasPrice, gasLimit: gasLimit };
    options['to'] = data.account ? data.account : null;
    if (data.balance) options['value'] = `0x${data.balance.toString(16)}`;
    if (data.bytecode) options['data'] = data.bytecode;
    await signAndSendRawTransaction(relayUrl, { chainId, from: sendAccountAddress, type: 2, ...options });
  }
};

describe('@api-conformity', async function () {
  before(async () => {
    relayOpenRpcData = await parseOpenRPCDocument(JSON.stringify(openRpcData));
  });

  describe('@conformity-batch-1 Ethereum execution apis tests', function () {
    this.timeout(240 * 1000);
    before(async () => {
      setLegacyTransactionAndBlockHash(await signAndSendRawTransaction(relayUrl, legacyTransaction));
      setTransaction2930AndBlockHash(await signAndSendRawTransaction(relayUrl, transaction2930));
      setTransaction1559AndBlockHash(await signAndSendRawTransaction(relayUrl, transaction1559));
      setCreateContractLegacyTransactionAndBlockHash(
        await signAndSendRawTransaction(relayUrl, createContractLegacyTransaction),
      );
      await initGenesisData();
      setCurrentBlockHash(await getLatestBlockHash(relayUrl));
    });
    //Reading the directories within the ethereum execution api repo
    //Adds tests for custom Hedera methods from the override directory to the list, even if they're not in the OpenRPC spec.
    let directories = [...new Set([...fs.readdirSync(directoryPath), ...fs.readdirSync(overwritesDirectoryPath)])];
    const relaySupportedMethodNames = openRpcData.methods.map((method) => method.name);
    //Filtering to use only the tests for methods we support in our relay
    directories = directories.filter((directory) => relaySupportedMethodNames.includes(directory));
    for (const directory of directories) {
      //Lists all files (tests) in a directory (method). Returns an empty array for a non-existing directory.
      const ls = (dir: string) => (fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? fs.readdirSync(dir) : []);
      const files = [
        ...new Set([...ls(path.join(directoryPath, directory)), ...ls(path.join(overwritesDirectoryPath, directory))]),
      ];
      for (const file of files) {
        const isCustom = fs.existsSync(path.join(overwritesDirectoryPath, directory, file));
        it(`Executing for ${directory} and ${file}${isCustom ? ' (overwritten)' : ''}`, async () => {
          const dir = isCustom ? overwritesDirectoryPath : directoryPath;
          const data = fs.readFileSync(path.resolve(dir, directory, file));
          const content = splitReqAndRes(data.toString('utf-8'));
          await processFileContent(directory, file, content);
        });
      }
    }
  });

  describe('@conformity-batch-2 Ethereum execution apis tests', async function () {
    this.timeout(240 * 1000);

    let existingBlockFilter: string;
    let existingContractFilter: string;

    before(async () => {
      existingBlockFilter = (
        await sendRequestToRelay(
          relayUrl,
          {
            jsonrpc: '2.0',
            method: 'eth_newBlockFilter',
            params: [],
            id: 1,
          },
          false,
        )
      ).result;

      const deployLogsContractTx = await signAndSendRawTransaction(relayUrl, {
        chainId,
        to: null,
        from: sendAccountAddress,
        maxPriorityFeePerGas: gasPrice,
        maxFeePerGas: gasPrice,
        gasLimit: gasLimit,
        type: 2,
        data: LogsContract.bytecode,
      });

      existingContractFilter = (
        await sendRequestToRelay(
          relayUrl,
          {
            jsonrpc: '2.0',
            method: 'eth_newFilter',
            params: [
              {
                fromBlock: '0x1',
                toBlock: '0x160c',
                address: deployLogsContractTx.contractAddress,
              },
            ],
            id: 1,
          },
          false,
        )
      ).result;
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TEST_CASES_BATCH_2 = require('./data/conformity-tests-batch-2.json');

    const updateParamIfNeeded = (testName: any, request: any) => {
      switch (testName) {
        case 'eth_getFilterChanges - existing filter':
          request.params = [existingBlockFilter];
          break;
        case 'eth_getFilterLogs - existing filter':
          request.params = [existingContractFilter];
          break;
      }

      return request;
    };

    synthesizeTestCases(TEST_CASES_BATCH_2, updateParamIfNeeded);
  });

  describe('@conformity-batch-3 Ethereum execution apis tests', async function () {
    this.timeout(240 * 1000);

    let txHash: any;

    before(async () => {
      txHash = (await signAndSendRawTransaction(relayUrl, transaction1559)).transactionHash;
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TEST_CASES_BATCH_3 = require('./data/conformity-tests-batch-3.json');

    const updateParamIfNeeded = (testName: any, request: any) => {
      switch (testName) {
        case 'debug_traceTransaction - existing tx':
          request.params = [
            txHash,
            {
              tracer: 'callTracer',
              tracerConfig: {
                onlyTopCall: true,
              },
            },
          ];
          break;
      }

      return request;
    };

    synthesizeTestCases(TEST_CASES_BATCH_3['server'], updateParamIfNeeded);

    describe('ws related rpc methods', async function () {
      let webSocket: WebSocket;
      let contractAddress: string;
      let existingFilter: string;

      before(async () => {
        contractAddress = (
          await signAndSendRawTransaction(relayUrl, {
            chainId,
            to: null,
            from: sendAccountAddress,
            maxPriorityFeePerGas: gasPrice,
            maxFeePerGas: gasPrice,
            gasLimit: gasLimit,
            type: 2,
            data: CallerContract.bytecode,
          })
        ).contractAddress;

        existingFilter = (
          await sendRequestToRelay(
            relayUrl,
            {
              jsonrpc: '2.0',
              method: 'eth_newFilter',
              params: [
                {
                  fromBlock: '0x3',
                  toBlock: '0x56ac',
                  address: contractAddress,
                },
              ],
              id: 1,
            },
            false,
          )
        ).result;
      });

      beforeEach(() => {
        webSocket = new WebSocket(wsRelayUrl);
      });

      afterEach(() => {
        webSocket.close();
      });

      const updateParamIfNeeded = (testName: any, request: any) => {
        switch (testName) {
          case 'eth_subscribe - existing contract':
            request.params = [
              'logs',
              {
                address: contractAddress,
              },
            ];
            break;
          case 'eth_unsubscribe - existing filter':
            request.params = [existingFilter];
            break;
        }

        return request;
      };

      const synthesizeWsTestCases = (testCases: any, updateParamIfNeeded: any) => {
        for (const testName in testCases) {
          it(`${testName}`, async () => {
            const req = updateParamIfNeeded(testName, JSON.parse(testCases[testName].request));

            let response: any = {};
            webSocket.on('message', function incoming(data: any) {
              response = JSON.parse(data);
            });
            webSocket.on('open', function open() {
              webSocket.send(JSON.stringify(req));
            });
            await new Promise((r) => setTimeout(r, 500));

            const hasMissingKeys: boolean = checkResponseFormat(response, JSON.parse(testCases[testName].response));
            expect(hasMissingKeys).to.be.false;
          });
        }
      };

      synthesizeWsTestCases(TEST_CASES_BATCH_3['ws-server'], updateParamIfNeeded);
    });
  });

  describe('@conformity-batch-4 Ethereum execution apis tests', async function () {
    this.timeout(240 * 1000);

    let existingCallerContractAddress: string;
    let existingLogsContractAddress: string;
    let fromBlockForLogs: string;

    before(async () => {
      const deployCallerContractTx = await signAndSendRawTransaction(relayUrl, {
        chainId: 0x12a,
        to: null,
        from: sendAccountAddress,
        maxPriorityFeePerGas: gasPrice,
        maxFeePerGas: gasPrice,
        gasLimit: gasLimit,
        type: 2,
        data: CallerContract.bytecode,
      });

      const deployLogsContractTx = await signAndSendRawTransaction(relayUrl, {
        chainId: 0x12a,
        to: null,
        from: sendAccountAddress,
        maxPriorityFeePerGas: gasPrice,
        maxFeePerGas: gasPrice,
        gasLimit: gasLimit,
        type: 2,
        data: LogsContract.bytecode,
      });

      existingCallerContractAddress = deployCallerContractTx.contractAddress;
      existingLogsContractAddress = deployLogsContractTx.contractAddress;

      const log0ContractCall = await signAndSendRawTransaction(relayUrl, {
        chainId: 0x12a,
        to: existingLogsContractAddress,
        from: sendAccountAddress,
        maxPriorityFeePerGas: gasPrice,
        maxFeePerGas: gasPrice,
        gasLimit: gasLimit,
        type: 2,
        data: '0xd05285d4000000000000000000000000000000000000000000000000000000000000160c',
      });

      fromBlockForLogs = log0ContractCall.blockNumber;
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TEST_CASES_BATCH_4 = require('./data/conformity-tests-batch-4.json');

    const updateParamIfNeeded = (testName: any, request: any) => {
      switch (testName) {
        case 'eth_call - existing contract view function and existing from':
          request.params = [
            {
              from: sendAccountAddress,
              to: existingCallerContractAddress,
              data: '0x0ec1551d',
            },
            'latest',
          ];
          break;
        case 'eth_call - existing contract tx and existing from':
          request.params = [
            {
              from: sendAccountAddress,
              to: existingCallerContractAddress,
              data: '0xddf363d7',
            },
            'latest',
          ];
          break;
        case 'eth_call - existing contract tx, existing from and positive value':
          request.params = [
            {
              from: sendAccountAddress,
              to: existingCallerContractAddress,
              data: '0xddf363d7',
              value: '0x2540be400',
            },
            'latest',
          ];
          break;
        case 'eth_call - existing contract view function and non-existing from':
          request.params = [
            {
              from: '0x6b175474e89094c44da98b954eedeac495271d0f',
              to: existingCallerContractAddress,
              data: '0x0ec1551d',
            },
            'latest',
          ];
          break;
        case 'eth_call - existing contract tx and non-existing from':
          request.params = [
            {
              from: '0x6b175474e89094c44da98b954eedeac495271d0f',
              to: existingCallerContractAddress,
              data: '0xddf363d7',
            },
            'latest',
          ];
          break;
        case 'eth_call - existing contract tx, non-existing from and positive value':
          request.params = [
            {
              from: '0x6b175474e89094c44da98b954eedeac495271d0f',
              to: existingCallerContractAddress,
              data: '0xddf363d7',
              value: '0x2540be400',
            },
            'latest',
          ];
          break;
        case 'eth_estimateGas - existing contract view function and existing from':
          request.params = [
            {
              from: sendAccountAddress,
              to: existingCallerContractAddress,
              data: '0x0ec1551d',
            },
            'latest',
          ];
          break;
        case 'eth_estimateGas - existing contract tx and existing from':
          request.params = [
            {
              from: sendAccountAddress,
              to: existingCallerContractAddress,
              data: '0xddf363d7',
            },
            'latest',
          ];
          break;
        case 'eth_estimateGas - existing contract tx, existing from and positive value':
          request.params = [
            {
              from: sendAccountAddress,
              to: existingCallerContractAddress,
              data: '0xddf363d7',
              value: '0x2540be400',
            },
            'latest',
          ];
          break;
        case 'eth_estimateGas - existing contract view function and non-existing from':
          request.params = [
            {
              from: '0x6b175474e89094c44da98b954eedeac495271d0f',
              to: existingCallerContractAddress,
              data: '0x0ec1551d',
            },
            'latest',
          ];
          break;
        case 'eth_estimateGas - existing contract tx and non-existing from':
          request.params = [
            {
              from: '0x6b175474e89094c44da98b954eedeac495271d0f',
              to: existingCallerContractAddress,
              data: '0xddf363d7',
            },
            'latest',
          ];
          break;
        case 'eth_estimateGas - existing contract tx, non-existing from and positive value':
          request.params = [
            {
              from: '0x6b175474e89094c44da98b954eedeac495271d0f',
              to: existingCallerContractAddress,
              data: '0xddf363d7',
              value: '0x2540be400',
            },
            'latest',
          ];
          break;
        case 'eth_getLogs - existing contract':
          request.params = [
            {
              address: existingLogsContractAddress,
            },
          ];
          break;
        case 'eth_getLogs - existing contract and from/to block':
          request.params = [
            {
              fromBlock: fromBlockForLogs,
              toBlock: 'latest',
              address: existingLogsContractAddress,
            },
          ];
          break;
      }

      return request;
    };

    synthesizeTestCases(TEST_CASES_BATCH_4, updateParamIfNeeded);
  });

  describe('@conformity-batch-5 Ethereum execution apis tests', async function () {
    this.timeout(240 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TEST_CASES_BATCH_5 = require('./data/conformity-tests-batch-5.json');

    const updateParamIfNeeded = (_testName: any, request: any) => request;
    synthesizeTestCases(TEST_CASES_BATCH_5, updateParamIfNeeded);
  });
});
