import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../.build/work/',import.meta.url)),dest=fileURLToPath(new URL('../dist/',import.meta.url));
await fs.mkdir(dest,{recursive:true});
const result=spawnSync(process.execPath,[process.env.npm_execpath,'pack','--pack-destination',dest],{cwd,stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
