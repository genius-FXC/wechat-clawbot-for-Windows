import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn as nativeSpawn,execFile as nativeExec, type ChildProcessWithoutNullStreams} from 'node:child_process';

export function launchSpec(file:string,args:readonly string[]=[]):{command:string,args:string[]} {
  if(/\.(?:cjs|mjs|js)$/i.test(file))return {command:process.execPath,args:[file,...args]};
  if(/\.(?:cmd|bat|ps1)$/i.test(file)) {
    const tool=path.basename(file).replace(/\.(cmd|bat|ps1)$/i,'');
    const entry=npmEntry(path.dirname(file),tool);
    if(entry)return {command:process.execPath,args:[entry,...args]};
    throw new Error('Cannot safely launch this script shim. Configure the native .exe or package JavaScript entry.');
  }
  return {command:file,args:[...args]};
}
function npmEntry(directory:string,tool:string):string|undefined {
  const pkg=tool==='codex'?'@openai/codex':tool==='claude'?'@anthropic-ai/claude-code':undefined;
  if(!pkg)return;
  for(const root of [path.join(directory,'node_modules'),path.basename(directory)==='.bin'?path.dirname(directory):'']) {
    if(!root)continue;
    try{const folder=path.join(root,pkg);const data=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));const bin=typeof data.bin==='string'?data.bin:data.bin?.[tool];
      if(typeof bin==='string'){const entry=path.resolve(folder,bin);if(entry.startsWith(path.resolve(folder)+path.sep)&&fs.existsSync(entry))return entry;}
    }catch{/* Try another known package root. */}
  }
}
export function findTool(tool:'codex'|'claude',override?:string):string {
  if(override?.trim())return override.trim();
  const folders=(process.env.PATH??'').split(path.delimiter).map(s=>s.trim().replace(/^"|"$/g,''));
  folders.push(path.join(os.homedir(),'.local','bin'),path.join(process.env.APPDATA??os.homedir(),'npm'));
  const candidates:string[]=[];
  if(process.platform==='win32'&&tool==='codex') {
    const root=path.join(process.env.LOCALAPPDATA??'','OpenAI','Codex','bin');
    try {for(const version of fs.readdirSync(root).sort((a,b)=>fs.statSync(path.join(root,b)).mtimeMs-fs.statSync(path.join(root,a)).mtimeMs))candidates.push(path.join(root,version,'codex.exe'));}catch{}
  }
  for(const folder of folders.filter(Boolean)) {
    if(process.platform==='win32')candidates.push(path.join(folder,tool+'.exe'));
    else candidates.push(path.join(folder,tool));
    const npm=npmEntry(folder,tool);if(npm)candidates.push(npm);
  }
  if(process.platform!=='win32')candidates.push('/opt/homebrew/bin/'+tool,'/usr/local/bin/'+tool);
  for(const candidate of candidates)try{if(fs.statSync(candidate).isFile())return candidate;}catch{}
  return process.platform==='win32'?tool+'.exe':tool;
}
export const spawnTool:typeof nativeSpawn=((file:string,args:string[],options:object)=>{
  const launch=launchSpec(file,args);return nativeSpawn(launch.command,launch.args,{...options,shell:false,windowsHide:true});
}) as typeof nativeSpawn;
export const execTool:typeof nativeExec=((file:string,args:string[],options:object,callback:any)=>{
  const launch=launchSpec(file,args);return nativeExec(launch.command,launch.args,{...options,shell:false,windowsHide:true},callback);
}) as typeof nativeExec;
export function defaultSocket():string {
  if(process.platform==='win32') {
    if(process.env.CLAWBOT_CODEX_PIPE)return process.env.CLAWBOT_CODEX_PIPE;
    throw new Error('Shared Codex mode on Windows requires codexSocket with the actual server named pipe. Use stdio for an independent background service.');
  }
  return path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'app-server-control','app-server-control.sock');
}
export function validateSocket(socket:string):void {
  if(process.platform==='win32') {
    if(!/^\\\\\.\\pipe\\[^\r\n]+$/i.test(socket))throw new Error('Windows codexSocket must be a local named pipe: \\\\.\\pipe\\<server-name>. A Unix .sock file is not supported.');
  }else if(!path.isAbsolute(socket))throw new Error('codexSocket must be an absolute IPC path');
}
export function closeChild(child:ChildProcessWithoutNullStreams|undefined):void {
  if(!child)return;
  child.stdin.end();
  const timer=setTimeout(()=>{if(child.exitCode===null)child.kill();},3000);timer.unref();child.once('close',()=>clearTimeout(timer));
}
