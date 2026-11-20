'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
function payloadSource(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes('installer-common.sh')) throw Error('Installer/updater tidak memakai helper bersama');
  const manifest = fs.readFileSync(path.join(root, 'deploy/release-files.list'), 'utf8');
  return source + '\n' + manifest.split('\n').map(line => '    ' + line).join('\n')
    + '\n' + fs.readFileSync(path.join(root, 'deploy/verify-release.js'), 'utf8');
}
module.exports = { payloadSource };
