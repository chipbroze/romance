import fs from 'node:fs';
import path from 'node:path';

function relative (relative_path) {
  return path.join(import.meta.dirname, relative_path);
}

const buffer = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD]);
const write_path = relative('./rom.bin');
fs.writeFileSync(write_path, buffer);
console.log(`Generated ${write_path}`);
