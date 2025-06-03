export const SKIPPED_KEYS = [
  "examples",
  "baseFeePerBlobGas",
  "blobGasUsedRatio"
];

export const CUSTOM_FIELDS = [
    "eth_accounts.description",
    "eth_accounts.result.description",
    "eth_accounts.result.schema.title",

    "eth_call.summary",

    "eth_coinbase.summary",
    "eth_blobBaseFee.summary",

    "eth_feeHistory.summary",
    "eth_feeHistory.description",
    "eth_feeHistory.params.2.description",
    "eth_feeHistory.result.name",
    "eth_feeHistory.result.schema.properties.gasUsedRatio.description",
    "eth_feeHistory.result.schema.properties.baseFeePerGas.title",
    "eth_feeHistory.result.schema.properties.baseFeePerGas.description",
    "eth_feeHistory.result.schema.properties.reward.title",

    "eth_gasPrice.summary",

    "eth_getBalance.result.schema.title",

    "eth_getBlockTransactionCountByHash.result.name",
    "eth_getBlockTransactionCountByNumber.result.name",

    "eth_getLogs.summary",
    "eth_getStorageAt.summary",
    "eth_getStorageAt.params.1.name",
    "eth_getStorageAt.result.name",

    "eth_getTransactionCount.summary",
    "eth_getTransactionCount.result.name",
    "eth_getTransactionCount.result.schema.title",

    "eth_maxPriorityFeePerGas.summary",
    "eth_maxPriorityFeePerGas.result.schema.description",
    "eth_maxPriorityFeePerGas.result.schema.title",

    "eth_newBlockFilter.summary",
    "eth_newBlockFilter.result.name",
];

export const DISCARDED_METHODS = [
  "engine_*"
];

export const NOT_IMPLEMENTED_METHODS = [
  "debug_getBadBlocks",
  "debug_getRawBlock",
  "debug_getRawHeader",
  "debug_getRawReceipts",
  "debug_getRawTransaction"
];

export const SKIPPED_METHODS = [
  ...DISCARDED_METHODS,
  ...NOT_IMPLEMENTED_METHODS
];

export function shouldSkipMethod(methodName, path) {
  if (!methodName) return false;

  if (path) {
    const fullPath = `${methodName}.${path}`;
    if (CUSTOM_FIELDS.includes(fullPath)) return true;
  }

  for (const pattern of SKIPPED_METHODS) {
    if (pattern === methodName) return true;

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (methodName.startsWith(prefix)) return true;
    }
  }
  
  return false;
}

export function shouldSkipKey(key) {
  if (!key) return false;
  
  for (const pattern of SKIPPED_KEYS) {
    if (pattern === key) return true;

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (key.startsWith(prefix)) return true;
    }
  }
  
  return false;
}

export function shouldSkipPath(path) {
  if (!path) return false;

  const parts = path.split('.');
  for (const part of parts) {
    if (shouldSkipKey(part)) return true;
  }
  
  return false;
}

export function getSkippedMethodCategory(methodName) {
  if (!methodName) return null;
  
  for (const pattern of DISCARDED_METHODS) {
    if (pattern === methodName) return 'discarded';
    
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (methodName.startsWith(prefix)) return 'discarded';
    }
  }
  
  for (const pattern of NOT_IMPLEMENTED_METHODS) {
    if (pattern === methodName) return 'not implemented';
    
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (methodName.startsWith(prefix)) return 'not implemented';
    }
  }
  
  return null;
}
