// SPDX-License-Identifier: Apache-2.0
import { signTransaction } from '@hashgraph/json-rpc-relay/tests/helpers';

import {
  ACCESS_LIST_FILE_NAME,
  createContractLegacyTransactionAndBlockHash,
  currentBlockHash,
  DYNAMIC_FEE_FILE_NAME,
  EMPTY_TX_FILE_NAME,
  EMPTY_TX_HASH,
  ETHEREUM_NETWORK_ACCOUNT_HASH,
  ETHEREUM_NETWORK_BLOCK_HASH,
  ETHEREUM_NETWORK_SIGNED_TRANSACTION,
  LEGACY_CONTRACT_FILE_NAME,
  LEGACY_CREATE_FILE_NAME,
  LEGACY_INPUT_FILE_NAME,
  LEGACY_RECEIPT_FILE_NAME,
  LEGACY_TX_FILE_NAME,
  legacyTransactionAndBlockHash,
  localNodeAccountPrivateKey,
  NONEXISTENT_TX_HASH,
  NOT_FOUND_TX_FILE_NAME,
  transaction1559AndBlockHash,
  transaction2930AndBlockHash,
} from './constants';
import { legacyTransaction } from './transactions';
import { getTransactionCount } from './utils';

export async function checkRequestBody(relayUrl: string, fileName: any, request: any) {
  /**
   * Modifies a request object for compatability with our network.
   *
   * @param {string} fileName - The name of the file associated with the request.
   * @param {Object} request - The request object to be modified.
   * @returns {Object} - The modified request object.
   */
  request = await updateRequestParams(relayUrl, request);

  if (request.method === 'eth_getTransactionByHash' || request.method === 'eth_getTransactionReceipt') {
    request = formatTransactionByHashAndReceiptRequests(fileName, request);
  }

  return request;
}

async function updateRequestParams(relayUrl: string, request: any): Promise<any> {
  const { method } = request;

  switch (method) {
    case 'eth_getBlockByHash':
    case 'eth_sendRawTransaction':
      if (
        (method === 'eth_getBlockByHash' && request.params[0] === ETHEREUM_NETWORK_BLOCK_HASH) ||
        (method === 'eth_sendRawTransaction' && request.params[0] === ETHEREUM_NETWORK_SIGNED_TRANSACTION)
      ) {
        request.params[0] = currentBlockHash;
      }
      if (method === 'eth_sendRawTransaction' && request.params[0] !== currentBlockHash) {
        legacyTransaction.nonce = parseInt(await getTransactionCount(relayUrl), 16);
        request.params[0] = await signTransaction(legacyTransaction, localNodeAccountPrivateKey);
      }
      break;
    case 'eth_getTransactionByBlockHashAndIndex':
      request.params[0] = legacyTransactionAndBlockHash.blockHash;
      request.params[1] = legacyTransactionAndBlockHash.transactionIndex;
      break;
    case 'eth_getTransactionByBlockNumberAndIndex':
      request.params[0] = legacyTransactionAndBlockHash.blockNumber;
      request.params[1] = legacyTransactionAndBlockHash.transactionIndex;
      break;
    case 'eth_getBalance':
      request.params[0] = ETHEREUM_NETWORK_ACCOUNT_HASH;
      request.params[1] = currentBlockHash;
      break;
  }

  return request;
}

export function formatTransactionByHashAndReceiptRequests(fileName: string, request: any) {
  /**
   * Formats a specific request by incorporating actual transaction and block hashes based on the provided file name.
   *
   * @param {string} fileName - The name of the file being processed.
   * @param {Object} request - The specific request to be formatted.
   * @returns {Object} - The formatted request containing updated transaction and block hashes.
   */
  const hashMappings = getFileNameToHashMapping();

  if (fileName in hashMappings) {
    request.params[0] = hashMappings[fileName];
  }

  return request;
}

function getFileNameToHashMapping() {
  return {
    [ACCESS_LIST_FILE_NAME]: transaction2930AndBlockHash.transactionHash,
    [DYNAMIC_FEE_FILE_NAME]: transaction1559AndBlockHash.transactionHash,
    [EMPTY_TX_FILE_NAME]: EMPTY_TX_HASH,
    [LEGACY_CREATE_FILE_NAME]: createContractLegacyTransactionAndBlockHash.transactionHash,
    [LEGACY_INPUT_FILE_NAME]: createContractLegacyTransactionAndBlockHash.transactionHash,
    [LEGACY_CONTRACT_FILE_NAME]: createContractLegacyTransactionAndBlockHash.transactionHash,
    [LEGACY_TX_FILE_NAME]: legacyTransactionAndBlockHash.transactionHash,
    [LEGACY_RECEIPT_FILE_NAME]: legacyTransactionAndBlockHash.transactionHash,
    [NOT_FOUND_TX_FILE_NAME]: NONEXISTENT_TX_HASH,
  };
}
