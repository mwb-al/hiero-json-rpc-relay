import { compareIgnoringFormatting } from '../operations/prepare.js';
import { shouldSkipPath, shouldSkipKey } from '../config.js';

export function getMethodMap(openrpcDoc) {
  const map = new Map();
  if (Array.isArray(openrpcDoc.methods)) {
    for (const m of openrpcDoc.methods) {
      if (m?.name) map.set(m.name, m);
    }
  }
  return map;
}

function hasKey(obj, path) {
  if (!path) return false;
  
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (current === undefined || current === null || typeof current !== 'object') {
      return false;
    }
    
    if (!(part in current)) {
      return false;
    }
    
    current = current[part];
  }
  
  return true;
}

export function groupPaths(paths, minGroupSize = 3) {
  if (!paths || paths.length === 0) return '-';
  if (paths.length === 1) return paths[0];

  function getDepth(path) {
    return path.split('.').length;
  }
  
  function analyzePrefixes(paths) {
    const prefixCounters = {};
    
    for (const path of paths) {
      const parts = path.split('.');
      let currentPrefix = '';
      
      for (let i = 0; i < parts.length - 1; i++) {
        currentPrefix = currentPrefix ? `${currentPrefix}.${parts[i]}` : parts[i];
        prefixCounters[currentPrefix] = (prefixCounters[currentPrefix] || 0) + 1;
      }
    }
    
    return Object.keys(prefixCounters)
      .filter(prefix => prefixCounters[prefix] >= minGroupSize)
      .sort((a, b) => {
        const countDiff = prefixCounters[b] - prefixCounters[a];
        if (countDiff !== 0) return countDiff;
        
        const depthA = getDepth(a);
        const depthB = getDepth(b);
        return depthB - depthA;
      });
  }

  function getSubpaths(paths, prefix) {
    return paths.filter(path => path.startsWith(prefix + '.') || path === prefix);
  }
  
  function groupPathsHierarchically(paths) {
    const remainingPaths = [...paths];
    const result = [];
    
    const commonPrefixes = analyzePrefixes(paths);
    
    for (const prefix of commonPrefixes) {
      const matchingPaths = getSubpaths(remainingPaths, prefix);
      
      if (matchingPaths.length >= minGroupSize) {
        for (const path of matchingPaths) {
          const index = remainingPaths.indexOf(path);
          if (index !== -1) {
            remainingPaths.splice(index, 1);
          }
        }
        
        result.push(`${prefix} (${matchingPaths.length} diffs)`);
      }
    }
    
    result.push(...remainingPaths);
    
    return result;
  }
  
  const groupedPaths = groupPathsHierarchically(paths);
  return groupedPaths.join(', ');
}

export function getDifferingKeysByCategory(origMethod, modMethod) {
  const result = {
    valueDiscrepancies: [],
    customFields: []
  };
  
  const differences = compareIgnoringFormatting(origMethod, modMethod) || [];
  
  for (const d of differences) {
    if (d.path) {
      const fullPath = d.path.join('.');
      
      if (!fullPath || fullPath.startsWith('name')) continue;
      
      if (shouldSkipPath(fullPath)) continue;
      
      if (hasKey(origMethod, fullPath) && hasKey(modMethod, fullPath)) {
        result.valueDiscrepancies.push(fullPath);
      }
      else if (!hasKey(origMethod, fullPath) && hasKey(modMethod, fullPath)) {
        result.customFields.push(fullPath);
      }
    }
  }
  
  function findMissingKeys(prefix, orig, mod) {
    for (const key in orig) {
      if (shouldSkipKey(key)) continue;
      
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      
      if (newPrefix === 'name') continue;
      
      if (shouldSkipPath(newPrefix)) continue;
      
      if (!(key in mod)) {
        result.valueDiscrepancies.push(newPrefix);
      } else if (
        typeof orig[key] === 'object' &&
        orig[key] !== null &&
        typeof mod[key] === 'object' &&
        mod[key] !== null &&
        !Array.isArray(orig[key]) &&
        !Array.isArray(mod[key])
      ) {
        findMissingKeys(newPrefix, orig[key], mod[key]);
      }
    }
  }
  
  findMissingKeys('', origMethod, modMethod);
  
  return result;
}

export function getDifferingKeys(origMethod, modMethod) {
  const { valueDiscrepancies, customFields } = getDifferingKeysByCategory(origMethod, modMethod);
  return [...new Set([...valueDiscrepancies, ...customFields])];
}
