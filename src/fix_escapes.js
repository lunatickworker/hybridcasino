// This file helps identify the corruption
const fs = require('fs');

const filePath = './components/admin/UserDetailModal.tsx';
const content = fs.readFileSync(filePath, 'utf8');

// Find lines with escaped quotes
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('\\\"') && index >= 920 && index <= 1050) {
    console.log(`Line ${index + 1}: ${line.substring(0, 100)}`);
  }
});

// Fix by replacing escaped quotes in the corrupted section
const fixed = content.replace(
  /className=\\"/g,
  'className="'
).replace(
  /\\"/g,
  '"'
);

fs.writeFileSync(filePath, fixed, 'utf8');
console.log('Fixed escaped quotes');
