import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {registerSendFileTool} from '../.build/work/lib/tool.js';
import {normalizeConfig} from '../.build/work/lib/config.js';
function setup(file){let definition;const state={typing:0,delivered:0};registerSendFileTool({tools:{register(d){definition=d;return()=>{};}}},{config:normalizeConfig({noticeMinBytes:1000000}),getAccount:()=>({configured:true,userId:'fixture-owner',baseUrl:'https://wechat.fixture.invalid',cdnBaseUrl:'https://cdn.fixture.invalid',token:'fixture-token-only'}),getBridge:()=>({activeSender:'fixture-owner',holdReply:async()=>false,noteAnswered(){},contextTokenFor:()=> 'fixture-context',showTyping:()=>state.typing++,noteDelivered:()=>state.delivered++,sendTextTo(){throw Error('Unexpected notice');}})});return {definition,state};}
test('real generated report follows the original encrypted WeChat file pipeline with mocked network only',async()=>{
  const file=path.resolve('.build/paper-pdf-qa/report-mathjax-full.pdf');let plaintext;try{plaintext=await fs.readFile(file);}catch{const root=path.resolve('.build/delivery-test');await fs.mkdir(root,{recursive:true});const fallback=path.join(root,'report.pdf');await fs.writeFile(fallback,fixturePDF());return testDelivery(fallback,await fs.readFile(fallback));}await testDelivery(file,plaintext);
  for(const name of ['part4-xml-repaired-volume-1.pdf','part4-xml-repaired-volume-2.pdf']){const volume=path.resolve('.build/paper-pdf-qa',name);try{const bytes=await fs.readFile(volume);await testDelivery(volume,bytes);}catch(e){if(e.code!=='ENOENT')throw e;}}
});
function fixturePDF(){const text='BT /F1 16 Tf 50 750 Td (Generated report delivery fixture) Tj ET',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${text.length} >>\nstream\n${text}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return pdf;}
async function testDelivery(file,plaintext){const {definition,state}=setup(file),originalFetch=globalThis.fetch;let key,ciphertext,message,calls=0;
  globalThis.fetch=async(url,options)=>{calls++;const u=new URL(url);assert.ok(['wechat.fixture.invalid','cdn.fixture.invalid'].includes(u.hostname));assert.equal(options.method,'POST');
    if(u.pathname.endsWith('/getuploadurl')){const body=JSON.parse(options.body);assert.equal(body.to_user_id,'fixture-owner');assert.equal(body.rawsize,plaintext.length);assert.equal(body.rawfilemd5,crypto.createHash('md5').update(plaintext).digest('hex'));key=Buffer.from(body.aeskey,'hex');return new Response(JSON.stringify({upload_full_url:'https://cdn.fixture.invalid/upload'}));}
    if(u.hostname==='cdn.fixture.invalid'){ciphertext=Buffer.from(options.body);return new Response('',{headers:{'x-encrypted-param':'fixture-download-param'}});}
    if(u.pathname.endsWith('/sendmessage')){message=JSON.parse(options.body);return new Response(JSON.stringify({ret:0}));}
    throw Error('Unmocked network endpoint');
  };
  try{const result=await definition.execute({path:file,caption:'本部分论文研读报告'});assert.equal(result.ok,true);assert.equal(calls,4);const decipher=crypto.createDecipheriv('aes-128-ecb',key,null);const decrypted=Buffer.concat([decipher.update(ciphertext),decipher.final()]);assert.deepEqual(decrypted,plaintext);assert.ok(JSON.stringify(message).includes(path.basename(file)));assert.ok(JSON.stringify(message).includes('fixture-context'));assert.equal(state.delivered,1);assert.deepEqual(await fs.readFile(file),plaintext);}finally{globalThis.fetch=originalFetch;}
}
test('oversized report is rejected before any upload and the original derived file remains intact',async()=>{
  const root=path.resolve('.build/delivery-test');await fs.mkdir(root,{recursive:true});const file=path.join(root,'oversized.pdf');await fs.writeFile(file,Buffer.alloc(1024*1024+1));const {definition}=setup(file),originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Should not upload');};try{const result=await definition.execute({path:file});assert.equal(result.ok,false);assert.equal(calls,0);assert.equal((await fs.stat(file)).size,1024*1024+1);}finally{globalThis.fetch=originalFetch;}
});
