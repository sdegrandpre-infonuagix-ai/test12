const fs = require('fs');
const js = fs.readFileSync('_tmp_check.js', 'utf8');
const lines = js.split('\n');

// Find the line where depth goes to 1 and the LAST place it returns to 0
// This tells us what block is never closed
let depth = 0;
let lastZero = 0;
let unclosedLine = -1;
let inString = false;
let stringChar = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    const prev = j > 0 ? line[j-1] : '';
    
    if (inString) {
      if (c === stringChar && prev !== '\\') inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '`') { inString = true; stringChar = '`'; continue; }
    if (c === '/' && line[j+1] === '/') break; // line comment
    
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) lastZero = i + 1;
    }
  }
  if (depth > 0 && unclosedLine === -1 && i > lastZero + 10) {
    // We've been at depth > 0 for 10 lines past the last zero
    // This might be an unclosed block
  }
}

console.log('Final depth:', depth);
console.log('Last line with depth=0:', lastZero);
console.log('\nLines', lastZero, 'to end:');
lines.slice(lastZero, lastZero + 30).forEach((l, i) => console.log(lastZero+i+1 + ':', l));
