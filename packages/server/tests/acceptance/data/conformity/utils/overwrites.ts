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
  if (
    (request.method === 'eth_getBlockByHash' && request.params[0] === ETHEREUM_NETWORK_BLOCK_HASH) ||
    (request.method === 'eth_sendRawTransaction' && request.params[0] === ETHEREUM_NETWORK_SIGNED_TRANSACTION)
  ) {
    request.params[0] = currentBlockHash;
  }
  if (request.method === 'eth_getTransactionByBlockHashAndIndex') {
    request.params[0] = legacyTransactionAndBlockHash.blockHash;
    request.params[1] = legacyTransactionAndBlockHash.transactionIndex;
  }
  if (request.method === 'eth_getTransactionByBlockNumberAndIndex') {
    request.params[0] = legacyTransactionAndBlockHash.blockNumber;
    request.params[1] = legacyTransactionAndBlockHash.transactionIndex;
  }
  if (request.method === 'eth_sendRawTransaction') {
    if (request.params[0] === ETHEREUM_NETWORK_SIGNED_TRANSACTION) {
      request.params[0] = currentBlockHash;
    } else {
      legacyTransaction.nonce = parseInt(await getTransactionCount(relayUrl), 16);
      request.params[0] = await signTransaction(legacyTransaction, localNodeAccountPrivateKey);
    }
  }
  if (request.method === 'eth_getBalance') {
    request.params[0] = ETHEREUM_NETWORK_ACCOUNT_HASH;
    request.params[1] = currentBlockHash;
  }
  if (request.method === 'eth_getTransactionByHash' || request.method === 'eth_getTransactionReceipt') {
    request = formatTransactionByHashAndReceiptRequests(fileName, request);
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
  switch (fileName) {
    case ACCESS_LIST_FILE_NAME:
      request.params[0] = transaction2930AndBlockHash.transactionHash;
      break;
    case DYNAMIC_FEE_FILE_NAME:
      request.params[0] = transaction1559AndBlockHash.transactionHash;
      break;
    case EMPTY_TX_FILE_NAME:
      request.params[0] = EMPTY_TX_HASH;
      break;
    case LEGACY_CREATE_FILE_NAME:
      request.params[0] = createContractLegacyTransactionAndBlockHash.transactionHash;
      break;
    case LEGACY_INPUT_FILE_NAME:
      request.params[0] = createContractLegacyTransactionAndBlockHash.transactionHash;
      break;
    case LEGACY_CONTRACT_FILE_NAME:
      request.params[0] = createContractLegacyTransactionAndBlockHash.transactionHash;
      break;
    case LEGACY_TX_FILE_NAME:
      request.params[0] = legacyTransactionAndBlockHash.transactionHash;
      break;
    case LEGACY_RECEIPT_FILE_NAME:
      request.params[0] = legacyTransactionAndBlockHash.transactionHash;
      break;
    case NOT_FOUND_TX_FILE_NAME:
      request.params[0] = NONEXISTENT_TX_HASH;
      break;
  }
  return request;
}
