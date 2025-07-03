// SPDX-License-Identifier: Apache-2.0
import Ajv from 'ajv';
import { expect } from 'chai';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const execApisOpenRpcData = require('../../../../../../../openrpc_exec_apis.json');

const ajv = new Ajv({ strict: false });

export function checkResponseFormat(actualResponse: any, expectedResponse: any, wildcards = []) {
  let parsedExpectedResponse = expectedResponse;
  if (typeof expectedResponse === 'string') {
    try {
      parsedExpectedResponse = JSON.parse(expectedResponse);
    } catch (e) {
      console.log(`Expected response is not a valid JSON string: ${expectedResponse}`);
      return true;
    }
  }

  const actualHasError = !!actualResponse.error;
  const expectedHasError = !!parsedExpectedResponse.error;

  if (actualHasError !== expectedHasError) {
    if (actualHasError) {
      console.log(`Received an unexpected error response: ${JSON.stringify(actualResponse.error)}`);
    } else {
      console.log(`Expected an error response, but received a success response: ${JSON.stringify(actualResponse)}`);
    }
    return true;
  }

  const actualResponseKeys = extractKeys(actualResponse);
  const expectedResponseKeys = extractKeys(parsedExpectedResponse);
  const missingKeys = expectedResponseKeys.filter((key) => !actualResponseKeys.includes(key));
  if (missingKeys.length > 0) {
    console.log(`Missing keys in response: ${JSON.stringify(missingKeys)}`);
    return true;
  }

  return checkValues(actualResponse, parsedExpectedResponse, wildcards);
}

function checkValues(actual: any, expected: any, wildcards: any, path = '') {
  if (path === '' && expected && typeof expected === 'object' && expected.error) {
    if (!actual || typeof actual !== 'object' || !actual.error) {
      return true;
    }
    const requiredErrorKeys = Object.keys(expected.error);
    for (const key of requiredErrorKeys) {
      if (!(key in actual.error)) {
        return true;
      }
    }
    return false;
  }
  if (expected === null || expected === undefined) {
    return actual !== null && actual !== undefined;
  }
  if (typeof actual !== typeof expected) {
    return true;
  }
  if (typeof expected !== 'object') {
    return actual !== expected;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return true;
    }
    for (let i = 0; i < expected.length; i++) {
      if (checkValues(actual[i], expected[i], wildcards, `${path}[${i}]`)) {
        return true;
      }
    }
    return false;
  }
  for (const key in expected) {
    const newPath = path ? `${path}.${key}` : key;
    if (wildcards.includes(newPath)) {
      continue;
    }
    if (!(key in actual)) {
      return true;
    }
    if (checkValues(actual[key], expected[key], wildcards, newPath)) {
      return true;
    }
  }
  return false;
}

export const findSchema = function (file: any) {
  return execApisOpenRpcData.methods.find((method: any) => method.name === file)?.result?.schema;
};

export function isResponseValid(schema: any, response: any) {
  const validate = ajv.compile(schema);
  const valid = validate(response.result);

  expect(validate.errors).to.be.null;

  return valid;
}

export function extractKeys(obj: any, prefix = ''): string[] {
  let keys: string[] = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      keys.push(newKey);

      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        keys = keys.concat(extractKeys(obj[key], newKey));
      }
    }
  }

  return keys;
}
