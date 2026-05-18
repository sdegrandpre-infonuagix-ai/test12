const fs = require('fs');
const h = fs.readFileSync('public/index.html', 'utf8');
const scripts = [...h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
let largest = scripts.reduce((a, b) => a[1].length > b[1].length ? a : b);
const tmpPath = require('path').join(__dirname, '_tmp_check.js');
fs.writeFileSync(tmpPath, largest[1], 'utf8');
console.log('Written to', tmpPath);
