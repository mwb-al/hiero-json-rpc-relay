// SPDX-License-Identifier: Apache-2.0
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { expect } from 'chai';

import { ErrorResponse, JsonRpcResponse, Method, Schema } from './interfaces';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const execApisOpenRpcData = require('../../../../../../../openrpc_exec_apis.json');

const ajv = new Ajv({ strict: false });
addFormats(ajv);

/**
 * Validates response format by comparing actual response against expected response structure.
 *
 * @param actualResponse - The actual response received from the API call
 * @param expectedResponse - The expected response structure to validate against (can be object, string, or ErrorResponse)
 * @param wildcards - Array of property paths to ignore during validation (default: empty array)
 * @returns {boolean} Returns true if the response format has issues (validation failed), false if format is valid
 *
 * @description
 * This function performs comprehensive response validation including:
 * - Parsing expected response if provided as string
 * - Checking error state consistency between actual and expected responses
 * - Missing key detection in response structure
 * - Deep value comparison with wildcard support
 *
 * @example
 * ```typescript
 * const actualResponse = { result: "0x123", id: 1 };
 * const expectedResponse = '{"result": "0x123", "id": 1}';
 * const hasIssues = hasResponseFormatIssues(actualResponse, expectedResponse);
 * console.log(hasIssues); // false - format is valid
 * ```
 *
 * @example
 * ```typescript
 * const actualResponse = { result: "0x123" };
 * const expectedResponse = { result: "0x123", id: 1 };
 * const hasIssues = hasResponseFormatIssues(actualResponse, expectedResponse);
 * console.log(hasIssues); // true - missing 'id' key
 * ```
 *
 * @example
 * ```typescript
 * const actualResponse = { result: "0x123", timestamp: "2023-01-01" };
 * const expectedResponse = { result: "0x123", timestamp: "2023-01-02" };
 * const wildcards = ["timestamp"];
 * const hasIssues = hasResponseFormatIssues(actualResponse, expectedResponse, wildcards);
 * console.log(hasIssues); // false - timestamp ignored due to wildcard
 * ```
 */
export function hasResponseFormatIssues(
  actualResponse: Record<string, unknown> | ErrorResponse | JsonRpcResponse,
  expectedResponse: Record<string, unknown> | string | ErrorResponse,
  wildcards: string[] = [],
) {
  let parsedExpectedResponse: Record<string, unknown> | ErrorResponse = expectedResponse as Record<string, unknown>;
  if (typeof expectedResponse === 'string') {
    try {
      parsedExpectedResponse = JSON.parse(expectedResponse);
    } catch (e) {
      console.log(`Expected response is not a valid JSON string: ${expectedResponse}`);
      return true;
    }
  }

  const actualHasError = !!(actualResponse as JsonRpcResponse).error;
  const expectedHasError = !!parsedExpectedResponse.error;

  if (actualHasError !== expectedHasError) {
    if (actualHasError) {
      console.log(
        `Received an unexpected error response: ${JSON.stringify((actualResponse as JsonRpcResponse).error)}`,
      );
    } else {
      console.log(`Expected an error response, but received a success response: ${JSON.stringify(actualResponse)}`);
    }
    return true;
  }

  const actualResponseKeys = extractKeys(actualResponse as Record<string, unknown>);
  const expectedResponseKeys = extractKeys(parsedExpectedResponse as Record<string, unknown>);
  const filteredExpectedKeys = expectedResponseKeys.filter((key) => !wildcards.includes(key));
  const missingKeys = filteredExpectedKeys.filter((key) => !actualResponseKeys.includes(key));

  if (missingKeys.length > 0) {
    console.log(`Missing keys in response: ${JSON.stringify(missingKeys)}`);
    return true;
  }

  return areValuesMatching(actualResponse, parsedExpectedResponse, wildcards);
}

/**
 * Checks if the actual response has the required error properties
 */
function checkErrorResponse(actual: Record<string, unknown>, expected: ErrorResponse): boolean {
  if (!actual || typeof actual !== 'object' || !actual.error) {
    return true;
  }
  const requiredErrorKeys = Object.keys(expected.error);
  for (const key of requiredErrorKeys) {
    if (!(key in (actual.error as Record<string, unknown>))) {
      return true;
    }
  }
  return false;
}

function arePrimitivesDifferent(actual: unknown, expected: unknown): boolean {
  return actual !== expected;
}

/**
 * Checks if two arrays have different values
 */
function checkArrayValues(actual: unknown[], expected: unknown[], wildcards: string[], path: string): boolean {
  if (actual.length !== expected.length) {
    return true;
  }

  for (let i = 0; i < expected.length; i++) {
    if (areValuesMatching(actual[i], expected[i], wildcards, `${path}[${i}]`)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if an object has all the required properties with matching values
 */
function checkObjectProperties(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  wildcards: string[],
  path: string,
): boolean {
  for (const key in expected) {
    const newPath = path ? `${path}.${key}` : key;
    if (wildcards.includes(newPath)) {
      continue;
    }
    if (!(key in actual)) {
      return true;
    }
    if (areValuesMatching(actual[key], expected[key], wildcards, newPath)) {
      return true;
    }
  }
  return false;
}

function checkComplexTypes(actual: object | null, expected: object, wildcards: string[], path: string): boolean {
  if (actual === null) {
    return true;
  }

  const isExpectedArray = Array.isArray(expected);
  const isActualArray = Array.isArray(actual);

  if (isExpectedArray !== isActualArray) {
    return true;
  }

  if (isExpectedArray) {
    return checkArrayValues(actual as unknown[], expected as unknown[], wildcards, path);
  }

  return checkObjectProperties(actual as Record<string, unknown>, expected as Record<string, unknown>, wildcards, path);
}

/**
 * Compares actual and expected values to determine if they match according to validation rules.
 *
 * @param actual - The actual value received from the response
 * @param expected - The expected value to compare against
 * @param wildcards - Array of property paths that should be ignored during comparison
 * @param path - Current property path being evaluated (used for nested object traversal)
 * @returns {boolean} - Returns true if values are different/don't match, false if they match
 *
 * @description
 * This function performs deep comparison between actual and expected values with special handling for:
 * - Error responses: Validates error structure when expected response contains an error property
 * - Null/undefined values: Handles null checks appropriately
 * - Type mismatches: Returns true (different) when types don't match
 * - Complex objects: Delegates to checkComplexTypes for arrays and objects
 * - Primitive values: Uses direct comparison for primitive types
 */
function areValuesMatching(actual: unknown, expected: unknown, wildcards: string[], path = ''): boolean {
  if (path === '' && expected && typeof expected === 'object' && (expected as ErrorResponse).error) {
    return checkErrorResponse(actual as Record<string, unknown>, expected as ErrorResponse);
  }

  if (expected == null) {
    return actual != null;
  }

  if (typeof actual !== typeof expected) {
    return true;
  }

  if (typeof expected === 'object') {
    return checkComplexTypes(actual as object | null, expected, wildcards, path);
  }

  return arePrimitivesDifferent(actual, expected);
}

export const findSchema = function (file: string): Schema | undefined {
  return (execApisOpenRpcData.methods as Method[]).find((method) => method.name === file)?.result?.schema;
};

export function isResponseValid(schema: Schema, response: { result: unknown }): boolean {
  const validate = ajv.compile(schema);
  const valid = validate(response.result);

  expect(validate.errors).to.be.null;

  return valid;
}

export function extractKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      keys.push(newKey);

      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        keys = keys.concat(extractKeys(obj[key] as Record<string, unknown>, newKey));
      }
    }
  }

  return keys;
}
