// SPDX-License-Identifier: Apache-2.0
import { bytecode } from '../../../../contracts/Basic.json';
import { chainId, gasLimit, gasPrice, receiveAccountAddress, sendAccountAddress, value } from './constants';

export const legacyTransaction: any = {
  chainId,
  to: receiveAccountAddress,
  from: sendAccountAddress,
  value,
  gasPrice,
  gasLimit: gasLimit,
  type: 0,
};

export const transaction2930 = {
  chainId,
  to: receiveAccountAddress,
  from: sendAccountAddress,
  value,
  gasPrice,
  gasLimit: gasLimit,
  type: 1,
};

export const transaction1559 = {
  chainId,
  to: receiveAccountAddress,
  from: sendAccountAddress,
  value,
  gasPrice,
  maxPriorityFeePerGas: gasPrice,
  maxFeePerGas: gasPrice,
  gasLimit: gasLimit,
  type: 2,
};

export const createContractLegacyTransaction = {
  chainId,
  to: null,
  from: sendAccountAddress,
  gasLimit: gasLimit,
  gasPrice: gasPrice,
  type: 0,
  data: bytecode,
};
