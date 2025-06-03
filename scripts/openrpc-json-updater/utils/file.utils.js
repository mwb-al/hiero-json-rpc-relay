import fs from 'fs';

export function readJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      data: JSON.parse(content),
      originalContent: content
    };
  } catch (err) {
    console.error(`Unable to read or parse "${filePath}":`, err);
    process.exit(1);
  }
}

function formatJson(obj, indent = '  ', level = 0) {
  const currentIndent = indent.repeat(level);
  const nextIndent = indent.repeat(level + 1);
  
  if (obj === null || obj === undefined) {
    return 'null';
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }
  
  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    if (obj.length <= 8 && obj.every(item =>
      (typeof item === 'string' && item.length < 40) ||
      (typeof item === 'number') ||
      (typeof item === 'boolean'))) {
      const items = obj.map(item => formatJson(item, indent)).join(', ');
      return `[${items}]`;
    }

    const items = obj.map(item => nextIndent + formatJson(item, indent, level + 1)).join(',\n');
    return items.length > 0 ? `[\n${items}\n${currentIndent}]` : '[]';
  }
  
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return '{}';
  }
  
  const props = entries.map(([key, value]) => {
    const formattedValue = formatJson(value, indent, level + 1);
    return `${nextIndent}"${key}": ${formattedValue}`;
  }).join(',\n');
  
  return `{\n${props}\n${currentIndent}}`;
}

export function writeJson(filePath, data, originalContent) {
  try {
    if (!originalContent) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    }

    const eol = originalContent.includes('\r\n') ? '\r\n' : '\n';
    const formatted = formatJson(data);
    
    const output = formatted.replace(/\n/g, eol);
    
    fs.writeFileSync(filePath, output, 'utf-8');
    return true;
  } catch (err) {
    console.error(`Unable to write to "${filePath}":`, err);
  }
}
