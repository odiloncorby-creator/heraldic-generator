const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBlasonCore() {
  const htmlPath = path.join(__dirname, '..', '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script id="blason-script">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('blason-script tag not found in index.html');
  }
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'index.html#blason-script' });
  return sandbox.module.exports;
}

module.exports = { loadBlasonCore };
