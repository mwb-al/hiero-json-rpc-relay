import { getMethodMap, getDifferingKeys } from '../utils/openrpc.utils.js';
import {shouldSkipPath, shouldSkipKey, shouldSkipMethod} from '../config.js';
import {
  setNestedValue,
  getNestedValue,
  hasNestedPath,
  removeSkippedKeys,
  handleRefField,
  getObjectByPath,
  setObjectByPath,
  findRefPaths,
  handleRefFieldsWithOriginal,
  filterSkippedMethods
} from '../utils/merge.utils.js';

class MergeDocuments {
  /**
   * Merges two OpenRPC documents
   * @param {Object} originalJson - The original OpenRPC document
   * @param {Object} modifiedJson - The modified Hedera OpenRPC document
   * @returns {Object} - The merged OpenRPC document
   */
  mergeDocuments(originalJson, modifiedJson) {
    if (!Array.isArray(originalJson.methods)) return modifiedJson;
    if (!Array.isArray(modifiedJson.methods)) modifiedJson.methods = [];

    // Step 1: Filter methods that should be skipped
    const filteredOriginal = this.filterDocument(originalJson);
    const filteredModified = this.filterDocument(modifiedJson);

    // Step 2: Merge methods from original to modified
    this.mergeMethods(filteredOriginal, filteredModified);

    // Step 3: Merge components from original to modified
    this.mergeComponents(filteredOriginal, filteredModified);

    // Step 4: Process the final document
    return this.processDocument(filteredModified, filteredOriginal);
  }

  /**
   * Filters a document to remove methods that should be skipped
   * @param {Object} document - The document to filter
   * @returns {Object} - The filtered document
   */
  filterDocument(document) {
    const filtered = JSON.parse(JSON.stringify(document));
    filtered.methods = filterSkippedMethods(filtered.methods);
    return filtered;
  }

  /**
   * Merges methods from original to modified
   * @param {Object} filteredOriginal - The filtered original document
   * @param {Object} filteredModified - The filtered modified document
   */
  mergeMethods(filteredOriginal, filteredModified) {
    const modifiedMap = getMethodMap(filteredModified);

    for (const origMethod of filteredOriginal.methods) {
      const name = origMethod.name;
      if (!name) continue;

      // If method doesn't exist in modified, add it
      if (!modifiedMap.has(name)) {
        filteredModified.methods.push(origMethod);
        continue;
      }

      const modMethod = modifiedMap.get(name);
      
      // Process $ref fields
      this.processRefFields(origMethod, modMethod);
      
      // Process differing keys
      this.processDifferingKeys(origMethod, modMethod);
    }
  }

  /**
   * Processes $ref fields in a method
   * @param {Object} origMethod - The original method
   * @param {Object} modMethod - The modified method
   */
  processRefFields(origMethod, modMethod) {
    const refPaths = findRefPaths(origMethod);

    for (const { path } of refPaths) {
      const targetObj = path ? getObjectByPath(modMethod, path) : modMethod;
      const origObj = path ? getObjectByPath(origMethod, path) : origMethod;

      if (targetObj && typeof targetObj === 'object' && origObj && typeof origObj === 'object') {
        if (path) {
          setObjectByPath(modMethod, path, JSON.parse(JSON.stringify(origObj)));
        } else {
          for (const key in modMethod) {
            delete modMethod[key];
          }
          for (const key in origObj) {
            modMethod[key] = origObj[key];
          }
        }
      }
    }
  }

  /**
   * Processes differing keys between original and modified methods
   * @param {Object} origMethod - The original method
   * @param {Object} modMethod - The modified method
   */
  processDifferingKeys(origMethod, modMethod) {
    const differingKeys = getDifferingKeys(origMethod, modMethod);

    for (const path of differingKeys) {
      if (shouldSkipPath(path)) continue;

      const methodName = origMethod.name;
      if (shouldSkipMethod(methodName, path)) continue;

      const valueFromOriginal = getNestedValue(origMethod, path);

      const existsInOriginal = hasNestedPath(origMethod, path);
      const existsInModified = hasNestedPath(modMethod, path);

      if (!existsInOriginal && existsInModified) {
        continue;
      }

      // Skip if path contains a $ref
      if (this.shouldSkipDueToRef(modMethod, path)) continue;

      // Set the value from original to modified
      if (path.includes('.')) {
        setNestedValue(modMethod, path, valueFromOriginal);
      } else {
        modMethod[path] = valueFromOriginal;
      }
    }
  }

  /**
   * Checks if a path should be skipped due to containing a $ref
   * @param {Object} obj - The object to check
   * @param {string} path - The path to check
   * @returns {boolean} - Whether the path should be skipped
   */
  shouldSkipDueToRef(obj, path) {
    const parts = path.split('.');
    let checkPath = '';
    for (let i = 0; i < parts.length; i++) {
      checkPath = checkPath ? `${checkPath}.${parts[i]}` : parts[i];
      const value = getNestedValue(obj, checkPath);
      if (value && typeof value === 'object' && value['$ref'] !== undefined) {
        return true;
      }
    }
    return false;
  }

  /**
   * Merges components from original to modified
   * @param {Object} filteredOriginal - The filtered original document
   * @param {Object} filteredModified - The filtered modified document
   */
  mergeComponents(filteredOriginal, filteredModified) {
    if (!filteredOriginal.components || typeof filteredOriginal.components !== 'object') {
      return;
    }

    if (!filteredModified.components) {
      filteredModified.components = {};
    }

    for (const section in filteredOriginal.components) {
      if (!filteredModified.components[section]) {
        filteredModified.components[section] = {};
      }

      for (const key in filteredOriginal.components[section]) {
        if (shouldSkipKey(key)) continue;

        if (!filteredModified.components[section][key]) {
          filteredModified.components[section][key] =
              removeSkippedKeys(filteredOriginal.components[section][key]);
        }
      }
    }
  }

  /**
   * Processes a document to handle $ref fields and remove skipped keys
   * @param {Object} document - The document to process
   * @param {Object} originalDocument - The original document
   * @returns {Object} - The processed document
   */
  processDocument(document, originalDocument) {
    if (!document || !document.methods || !Array.isArray(document.methods)) {
      return document;
    }

    const result = JSON.parse(JSON.stringify(document));

    // Filter methods that should be skipped
    result.methods = result.methods.filter(method => {
      const methodName = method?.name;
      if (!methodName) return true;
      return !shouldSkipMethod(methodName);
    });

    // Remove skipped keys
    result.methods = result.methods.map(method => removeSkippedKeys(method));

    if (originalDocument) {
      if (result.methods && originalDocument.methods) {
        const origMethodMap = getMethodMap(originalDocument);
        result.methods = result.methods.map(method => {
          const origMethod = origMethodMap.get(method.name);
          return origMethod ? handleRefFieldsWithOriginal(method, origMethod) : method;
        });
      }

      if (result.components && originalDocument.components) {
        result.components = handleRefFieldsWithOriginal(result.components, originalDocument.components, true);
      }

      return result;
    }

    return handleRefField(result);
  }
}

const mergeDocumentsInstance = new MergeDocuments();

/**
 * Merges two OpenRPC documents
 * @param {Object} originalJson - The original OpenRPC document
 * @param {Object} modifiedJson - The modified OpenRPC document
 * @returns {Object} - The merged OpenRPC document
 */
export function mergeDocuments(originalJson, modifiedJson) {
  return mergeDocumentsInstance.mergeDocuments(originalJson, modifiedJson);
}
