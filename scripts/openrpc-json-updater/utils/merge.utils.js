import { shouldSkipKey, shouldSkipMethod } from '../config.js';

/**
 * Sets a nested value in an object using a dot-notation path
 */
export function setNestedValue(obj, path, value) {
  if (!path) return;

  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {};
    }

    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * Gets a nested value from an object using a dot-notation path
 */
export function getNestedValue(obj, path) {
  if (!path) return undefined;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Checks if a nested path exists in an object
 */
export function hasNestedPath(obj, path) {
  const value = getNestedValue(obj, path);
  return value !== undefined;
}

/**
 * Removes keys that should be skipped from an object
 */
export function removeSkippedKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => removeSkippedKeys(item));
  }

  const result = {};
  for (const key in obj) {
    if (shouldSkipKey(key)) continue;

    result[key] = removeSkippedKeys(obj[key]);
  }

  return result;
}

/**
 * Handles $ref fields in an object
 */
export function handleRefField(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => handleRefField(item));
  }

  if (obj['$ref'] !== undefined) {
    return { '$ref': obj['$ref'] };
  }

  const result = {};
  for (const key in obj) {
    result[key] = handleRefField(obj[key]);
  }

  return result;
}

/**
 * Gets an object by path from an object
 */
export function getObjectByPath(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Sets an object by path in an object
 */
export function setObjectByPath(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {};
    }

    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * Finds all paths in an object that contain $ref fields
 */
export function findRefPaths(obj, currentPath = '', paths = []) {
  if (!obj || typeof obj !== 'object') return paths;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      findRefPaths(obj[i], currentPath ? `${currentPath}.${i}` : `${i}`, paths);
    }
  } else {
    if (obj['$ref'] !== undefined) {
      paths.push({
        path: currentPath,
        ref: obj['$ref']
      });
    }

    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        findRefPaths(obj[key], currentPath ? `${currentPath}.${key}` : key, paths);
      }
    }
  }

  return paths;
}

/**
 * Handles $ref fields with an original object
 */
export function handleRefFieldsWithOriginal(obj, origObj, isComponent = false) {
  if (!obj || typeof obj !== 'object') return obj;
  if (!origObj || typeof origObj !== 'object') return isComponent ? obj : handleRefField(obj);

  if (Array.isArray(obj)) {
    return obj.map((item, index) => 
      index < origObj.length ? handleRefFieldsWithOriginal(item, origObj[index], isComponent) : (isComponent ? item : handleRefField(item))
    );
  }

  if (origObj['$ref'] !== undefined) {
    return JSON.parse(JSON.stringify(origObj));
  }

  if (obj['$ref'] !== undefined) {
    if (isComponent) {
      return JSON.parse(JSON.stringify(obj));
    }
    return { '$ref': obj['$ref'] };
  }

  const newObj = {};
  for (const key in obj) {
    const origValue = origObj[key];
    newObj[key] = handleRefFieldsWithOriginal(obj[key], origValue, isComponent);
  }

  return newObj;
}

/**
 * Filters methods that should be skipped
 */
export function filterSkippedMethods(methods) {
  if (!Array.isArray(methods)) return [];
  
  return methods.filter(method => {
    const methodName = method?.name;
    if (!methodName) return true;
    return !shouldSkipMethod(methodName);
  });
}
