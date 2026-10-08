import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {once} from 'node:events';
import sharp from 'sharp';
import {launchSpec,spawnTool,validateSocket,findTool} from '../.build/work/lib/windows-platform.js';
import {compressForUpload,makePreviewCopy} from '../.build/work/lib/image-compress.js';
import {normalizeConfig} from '../.build/work/lib/config.js';
test('Packaged browser registration and exports agree with the Windows package name',async()=>{
 const pkg=JSON.parse(await fs.readFile(new URL('../.build/work/package.json',import.meta.url),'utf8'));
 let registered;const script=await fs.readFile(new URL('../.build/work/lib/client.js',import.meta.url),'utf8');
 vm.runInNewContext(script,{window:{__ModuleLoader__:{load:value=>registered=value.id}}});
 assert.equal(registered,pkg.name);assert.ok(script.includes('const PACKAGE = "'+pkg.name+'"'));
 for(const file of [pkg.main,pkg.types,pkg.exports['.'].default,pkg.exports['.'].types])await fs.access(new URL('../.build/work/'+file,import.meta.url));
});
test('Windows defaults to stdio without weakening approval policy',()=>{
 assert.equal(normalizeConfig({}).codexTransport,'stdio');assert.equal(normalizeConfig({codexTransport:'socket'}).codexTransport,'socket');
});
test('JavaScript CLI paths with spaces and shell metacharacters remain literal arguments',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'clawbot path '));
 try{const file=path.join(dir,'mock cli.mjs');await fs.writeFile(file,'console.log(JSON.stringify(process.argv.slice(2)))');
 const args=['a b','x&whoami','quote"here','$HOME'];const child=spawnTool(file,args,{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',s=>output+=s);child.stdin.end();const [code]=await once(child,'close');assert.equal(code,0);assert.deepEqual(JSON.parse(output),args);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Official npm shims resolve to JS, unknown shims are rejected',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'clawbot-shim-'));
 try{const pkg=path.join(dir,'node_modules/@openai/codex');await fs.mkdir(path.join(pkg,'bin'),{recursive:true});await fs.writeFile(path.join(pkg,'package.json'),JSON.stringify({bin:{codex:'bin/codex.js'}}));await fs.writeFile(path.join(pkg,'bin/codex.js'),'');
 const result=launchSpec(path.join(dir,'codex.cmd'),['app-server']);assert.equal(result.command,process.execPath);assert.equal(result.args[0],path.join(pkg,'bin/codex.js'));
 assert.throws(()=>launchSpec(path.join(dir,'unknown.cmd')),/Cannot safely/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Shared mode accepts local named pipes and rejects ordinary Windows files',()=>{
 if(process.platform!=='win32')return;
 validateSocket('\\\\.\\pipe\\codex-test');assert.throws(()=>validateSocket('C:\\tmp\\rpc.sock'),/named pipe/);assert.throws(()=>validateSocket('\\\\remote\\pipe\\codex'),/named pipe/);
});
test('Codex override preserved',()=>assert.equal(findTool('codex','C:\\Program Files\\Codex\\codex.exe'),'C:\\Program Files\\Codex\\codex.exe'));
test('Real image compression replaces sips, retains original, preserves GIF',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'clawbot-image-'));let output;
 try{const file=path.join(dir,'large image.png');await sharp({create:{width:2400,height:1600,channels:3,background:'#2070aa'}}).png().toFile(file);
 const initial=await fs.readFile(file);output=compressForUpload(file,{maxImageEdge:800,imageQuality:75,compressThresholdBytes:100000});assert.equal(output.temp,true);const metadata=await sharp(output.path).metadata();assert.equal(metadata.width,800);assert.equal(metadata.format,'jpeg');assert.deepEqual(await fs.readFile(file),initial);
 const gif=path.join(dir,'animated.gif');await fs.writeFile(gif,'not decoded');assert.equal(makePreviewCopy(gif,{maxImageEdge:100,imageQuality:60,compressThresholdBytes:1}),gif);
 assert.equal(compressForUpload(path.join(dir,'missing.png'),{maxImageEdge:800,imageQuality:75,compressThresholdBytes:100000}).temp,false);
 }finally{if(output?.temp)await fs.rm(output.path,{force:true});await fs.rm(dir,{recursive:true,force:true});}
});
