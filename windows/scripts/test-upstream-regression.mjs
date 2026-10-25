import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// Upstream's static checks intentionally recognize only upstream's own fields
// and source shapes. Run them on a pristine, pinned copy; windows/tests checks
// the integrated build and the interactions with our extensions separately.
const windows=fileURLToPath(new URL('../',import.meta.url)),root=path.dirname(windows.slice(0,-1));
const manifest=JSON.parse(fs.readFileSync(path.join(windows,'upstream.json'),'utf8'));
const work=path.join(windows,'.build/upstream-regression');fs.mkdirSync(work,{recursive:true});
for(const [file,want]of Object.entries(manifest.files)){
  const text=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  if(crypto.createHash('sha256').update(text).digest('hex')!==want)throw Error('Pinned upstream changed: '+file);
  const target=path.join(work,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
}
const compile=spawnSync(process.execPath,[path.join(windows,'node_modules/typescript/bin/tsc'),'-p',path.join(work,'tsconfig.json')],{cwd:work,stdio:'inherit',windowsHide:true});
if(compile.status!==0)process.exit(compile.status??1);
fs.copyFileSync(path.join(work,'src/client.js'),path.join(work,'lib/client.js'));
let source=fs.readFileSync(path.join(work,'test/regression.mjs'),'utf8').replace(/\bimport\(/g,'importLocal(');
// The two subprocess probes already use file URLs; do not wrap their imports.
source=source.replaceAll('const m = await importLocal(', 'const m = await import(');
source=source.replace('const HERE =', 'const importLocal = (p) => import(/^(?:[a-z]:[\\\\/]|\\/)/i.test(p) ? pathToFileURL(p).href : p);\nconst HERE =');
if(process.platform==='win32'){
  const start=source.indexOf('  // A fake home with an OLD npm install'),end=source.indexOf('  const { strayJobs, releaseStep }',start);
  if(start<0||end<start)throw Error('POSIX discovery fixture anchor changed');
  source=source.slice(0,start)+'  console.log("SKIP: POSIX Claude-discovery symlink fixture; Windows discovery is tested separately.");\n'+source.slice(end);
  const modeChecks=['token file is 0600','backlog: kept per recipient, oldest first, on disk with mode 0600',"secretary: …into a private copy, with the owner's wording"];
  source=source.replace('function check(name, ok, detail) {','function check(name, ok, detail) {\n  if ('+JSON.stringify(modeChecks)+'.includes(name)) { results.push("  SKIP: POSIX mode bits on Windows: "+name); return; }');
}
fs.writeFileSync(path.join(work,'test/regression-windows.mjs'),source);
const cacheRoots=[path.join(process.env.LOCALAPPDATA||'','npm-cache/_npx'),path.join(os.homedir(),'AppData/Local/npm-cache/_npx'),path.join(os.homedir(),'.npm/_npx')];
const hosts=cacheRoots.filter(p=>fs.existsSync(p)).flatMap(p=>fs.readdirSync(p).map(n=>path.join(p,n,'node_modules'))).filter(p=>fs.existsSync(path.join(p,'@deepseek-ai/dsh/package.json')));
const host=process.env.DSH_NPX||hosts.sort((a,b)=>fs.statSync(path.join(b,'@deepseek-ai/dsh/package.json')).mtimeMs-fs.statSync(path.join(a,'@deepseek-ai/dsh/package.json')).mtimeMs)[0];
if(!host)throw Error('Set DSH_NPX to the node_modules directory of a local DSH installation');
const state=path.join(work,'.regression-state'),temporary=path.join(work,'.regression-temp'),dshHome=path.join(work,'.regression-host');
for(const dir of [state,temporary,path.join(dshHome,'clawbot')])fs.mkdirSync(dir,{recursive:true});
// The memory-rule assertions expect an existing memory, never the operator's.
for(const dir of [state,path.join(dshHome,'clawbot')])fs.writeFileSync(path.join(dir,'memory.md'),'# Synthetic regression fixture\n\n## 基本档案\n- Test data only.\n');
const result=spawnSync(process.execPath,['test/regression-windows.mjs'],{cwd:work,env:{...process.env,TEMP:temporary,TMP:temporary,DSH_NPX:host,DSH_HOME:dshHome,CLAWBOT_STATE_DIR:state},stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
