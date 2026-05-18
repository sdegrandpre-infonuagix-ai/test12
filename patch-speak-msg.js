const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

const NEW_MSG = "This is Test 1 2, the vocal social network.";

// Replace all welcome/username speak() variants
h = h.replace(
  /speak\(`Welcome[^`]*public username is \${[^`]*}`\)/g,
  `speak('${NEW_MSG}')`
);
h = h.replace(
  /speak\(`Welcome to Test One Two![^`]*`\)/g,
  `speak('${NEW_MSG}')`
);
h = h.replace(
  /speak\(`Your account has been created[^`]*`\)/g,
  `speak('${NEW_MSG}')`
);

fs.writeFileSync('public/index.html', h, 'utf8');

// Verify
const h2 = fs.readFileSync('public/index.html', 'utf8');
const remaining = (h2.match(/speak\(`Welcome/g)||[]).length + (h2.match(/speak\(`Your account/g)||[]).length;
console.log('Old welcome speak() remaining:', remaining);
console.log('New message occurrences:', (h2.match(/vocal social network/g)||[]).length);
