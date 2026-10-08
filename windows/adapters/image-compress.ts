import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export type ImageCompressOptions={maxImageEdge:number;imageQuality:number;compressThresholdBytes:number};
export type UploadPrep={path:string;bytes:number;temp:boolean;note?:string};
function prepare(file:string,opts:ImageCompressOptions):UploadPrep {
  const original=()=>({path:file,bytes:fs.existsSync(file)?fs.statSync(file).size:0,temp:false});
  if(!/\.(jpe?g|png|webp|heic|heif|bmp|tiff?)$/i.test(file))return original();
  try{return JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./windows-image-worker.mjs',import.meta.url)),JSON.stringify({file:path.resolve(file),opts})],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1048576,stdio:['ignore','pipe','pipe']}));}
  catch{return original();}
}
export function compressForUpload(file:string,opts:ImageCompressOptions):UploadPrep{return prepare(file,opts);}
export function makePreviewCopy(file:string,opts:ImageCompressOptions):string{return prepare(file,opts).path;}
