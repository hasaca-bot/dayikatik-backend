const fs = require('node:fs');
const path = require('node:path');
const { files, directories } = require('../public-files');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'public-site');
if (path.dirname(output) !== root || path.basename(output) !== 'public-site') throw new Error('Unsafe output path');
if (fs.existsSync(output)) {
  if (fs.lstatSync(output).isSymbolicLink() || fs.realpathSync(output) !== output) throw new Error('Output must be a local directory');
  fs.rmSync(output, { recursive: true });
}
fs.mkdirSync(output);
for (const entry of [...files, ...directories]) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), {
    recursive: true,
    filter: source => {
      if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Symlinks are not public assets');
      return !path.basename(source).startsWith('.');
    }
  });
}
console.log('Static site built in public-site/ using the public file allowlist.');
