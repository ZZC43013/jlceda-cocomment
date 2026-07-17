import path from 'node:path';
import fs from 'fs-extra';

const srcDir = path.join(__dirname, '../src/iframe');
const outDir = path.join(__dirname, '../dist/iframe');

fs.copySync(srcDir, outDir, { overwrite: true });
console.log(`[CoComment] Copied iframe assets to ${outDir}`);
