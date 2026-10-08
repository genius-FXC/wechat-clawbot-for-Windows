import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const module=fileURLToPath(new URL('../.build/work/lib/windows-platform.js',import.meta.url));
if(!fs.existsSync(module))throw Error('Run npm run build first.');
const {findTool}=await import(new URL('../.build/work/lib/windows-platform.js',import.meta.url));
for(const tool of ['codex','claude']){const binary=findTool(tool);console.log(tool+': '+(fs.existsSync(binary)?binary:'not found; configure its executable path'));}
console.log('Platform: '+process.platform+'; Node: '+process.version);
console.log('Default Codex transport: stdio. Shared mode needs a real local named-pipe server.');
console.log('No credentials were read, no models called and no WeChat messages sent.');
