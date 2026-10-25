import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));const lib=path.join(root,'lib');await fs.mkdir(lib,{recursive:true});
for(const file of ['index.mjs','engine.mjs','client.js','network.mjs'])await fs.copyFile(path.join(root,file),path.join(lib,file));
await fs.copyFile(path.join(root,'../literature/zotero.mjs'),path.join(lib,'zotero.mjs'));
console.log('独立推荐插件已构建。');
