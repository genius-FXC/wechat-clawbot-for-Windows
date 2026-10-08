import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
const {file,opts}=JSON.parse(process.argv[2]);
sharp.cache(false);
const stat=await fs.stat(file),meta=await sharp(file).metadata();
if(stat.size<=opts.compressThresholdBytes&&Math.max(meta.width||0,meta.height||0)<=opts.maxImageEdge){console.log(JSON.stringify({path:file,bytes:stat.size,temp:false}));}
else {
 let best;const output=path.join(os.tmpdir(),'clawbot-windows-'+randomUUID()+'.jpg');
 try{
  for(const quality of [...new Set([opts.imageQuality,60,40])]) {
    const buffer=await sharp(file).rotate().resize({width:opts.maxImageEdge,height:opts.maxImageEdge,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality}).toBuffer();
    if(!best||buffer.length<best.length)best=buffer;
    if(buffer.length<=opts.compressThresholdBytes)break;
  }
  if(!best)throw Error('No image generated');
  await fs.writeFile(output,best,{flag:'wx'});
  console.log(JSON.stringify({path:output,bytes:best.length,temp:true,note:`${meta.width}×${meta.height} ${(stat.size/1048576).toFixed(1)}MB → ${(best.length/1048576).toFixed(1)}MB`}));
 }catch(error){await fs.rm(output,{force:true});throw error;}
}
