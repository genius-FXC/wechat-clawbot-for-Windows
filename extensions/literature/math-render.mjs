import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {mathjax} from '@mathjax/src/js/mathjax.js';
import {TeX} from '@mathjax/src/js/input/tex.js';
import {SVG} from '@mathjax/src/js/output/svg.js';
import {liteAdaptor} from '@mathjax/src/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/util/asyncLoad/esm.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';

// No HTML, links, require, autoload, shell, or remote font loaders. Font ranges
// are preloaded from this installed npm package before document text is parsed.
const adaptor=liteAdaptor({fontSize:16});RegisterHTMLHandler(adaptor);
const tex=new TeX({packages:['base','ams'],maxMacros:1000,maxBuffer:20000,formatError(_jax,error){throw error;}});
const svg=new SVG({fontCache:'none',linebreaks:{inline:false}});await svg.font.loadDynamicFiles();
const document=mathjax.document('',{InputJax:tex,OutputJax:svg});
export async function renderEquation(value,out,display=false){
  if(typeof value!=='string'||value.length>8000||/\\(?:require|href|url|html|includegraphics|input)\b/i.test(value))throw Error('不支持的公式命令或过长公式');
  const node=document.convert(value,{display,em:16,ex:8,containerWidth:740});
  const svgNode=adaptor.tags(node,'svg')[0],source=svgNode?adaptor.serializeXML(svgNode):null;
  if(!source)throw Error('公式未生成 SVG');const box=source.match(/viewBox="([^\"]+)"/)?.[1]?.split(/\s+/).map(Number);if(!box||box.length!==4||!box.every(Number.isFinite))throw Error('公式尺寸无效');
  const width=Math.max(3,11*box[2]/1000),height=Math.max(5,11*box[3]/1000);if(width>5000||height>1500)throw Error('公式排版尺寸过大');
  const raster=source.replace(/width="[^"]*"/,`width="${Math.ceil(width*3)}"`).replace(/height="[^"]*"/,`height="${Math.ceil(height*3)}"`);
  const target=path.join(out,createHash('sha256').update(value+'|'+display).digest('hex')+'.png');await fs.mkdir(out,{recursive:true});await sharp(Buffer.from(raster)).flatten({background:'#ffffff'}).png().toFile(target);
  return {path:target,width,height};
}
if(process.argv.includes('--worker')){let data='';for await(const b of process.stdin){data+=b;if(data.length>250000)throw Error('公式请求过大');}try{const args=JSON.parse(data);if(!Array.isArray(args.equations)||args.equations.length>600)throw Error('公式数量过大');const result=[];for(const e of args.equations)result.push({...e,...await renderEquation(e.value,args.out,e.display)});console.log(JSON.stringify({ok:true,equations:result}));}catch(e){console.log(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}}
