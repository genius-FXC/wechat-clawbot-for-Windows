import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {workerCall} from '../.build/work/lib/literature/core.mjs';
import {renderEquation} from '../.build/work/lib/literature/math-render.mjs';
const python=process.env.CLAWBOT_TEST_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const available=await fs.stat(python).then(()=>true,()=>false);
test('a full inline expression remains one complete SVG rather than its first math fragment',async()=>{
  const out=path.resolve('.build/math-regression');const a=await renderEquation(String.raw`\lambda`,out),b=await renderEquation(String.raw`\lambda=2\pi/Q`,out);
  assert.ok(b.width>a.width*3);assert.ok(b.height>0);await assert.rejects(renderEquation(String.raw`\href{https://example.com}{x}`,out),/不支持/);
  const inequality=await renderEquation(String.raw`E<10\,{\rm meV}`,out);assert.ok(inequality.width>a.width);const aligned=await renderEquation(String.raw`\begin{aligned}x&=1\\y&=2\end{aligned}`,out,true);assert.ok(aligned.height>inequality.height);
});
test('UTF8 Chinese report with nested fractions and inline equations exports readable PDF and preserves Markdown', {skip:!available}, async()=>{
  const root=path.resolve('.build/pdf-regression');await fs.mkdir(root,{recursive:true});const out=await fs.mkdtemp(path.join(root,'run-')),md=path.join(out,'完整公式.md'),pdf=path.join(out,'完整公式.pdf');
  const content=String.raw`# 中文论文排版自测

此文件只用于程序排版检查，不是论文结论。行内公式 \(\lambda=2\pi/Q\) 后的中文应保留，末尾文字也不能丢失。

\[
Q_{\rm Fe}=\frac{2\pi}{a_{\rm Fe}},\qquad A_{\mathbf Q}(\mathbf r)=\int d\mathbf R\,A(\mathbf R)e^{i\mathbf Q\cdot\mathbf R}.
\]

继续段落包含 Greek λ、上标 \(\sigma_0^2\) 和中文单位，原始 Markdown 仍保留 LaTeX。`;
  await fs.writeFile(md,content);const result=await workerCall(python,{action:'export',markdown:md,target:pdf,title:'中文完整公式',node:process.execPath,mathRenderer:path.resolve('.build/work/lib/literature/math-render.mjs')});assert.ok(result.bytes>50000);assert.equal(await fs.readFile(md,'utf8'),content);
  const metadata=await workerCall(python,{action:'extract',source:pdf,out:path.join(out,'extract')});assert.equal(metadata.pageCount,1);const data=JSON.parse(await fs.readFile(path.join(out,'extract/pages.json'),'utf8'));assert.ok(data.pages[0].text.includes('末尾文字'));assert.ok(data.pages[0].images>=3);
});
test('aborting a running owned PDF worker waits until its process tree has stopped',{skip:!available},async()=>{
  const controller=new AbortController(),started=performance.now();const call=workerCall(python,{action:'extract',source:'unused.pdf',out:path.resolve('.build/cancel-fixture')},controller.signal);setTimeout(()=>controller.abort(Error('test abort running worker')),40);await assert.rejects(call,/test abort running worker/);assert.ok(performance.now()-started<8000);
});

test('large generated reports split into ordered deliverable volumes without changing the complete PDF',{skip:!available},async()=>{
  const root=path.resolve('.build/pdf-delivery-regression');await fs.mkdir(root,{recursive:true});const out=await fs.mkdtemp(path.join(root,'run-')),pdf=path.join(out,'large-generated.pdf');
  await promisify(execFile)(python,['-X','utf8','-c',String.raw`import sys, random
from io import BytesIO
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
r=random.Random(42)
c=canvas.Canvas(sys.argv[1])
for n in range(6):
 im=Image.frombytes('RGB',(640,960),r.randbytes(640*960*3)); b=BytesIO(); im.save(b,format='JPEG',quality=88); b.seek(0)
 c.drawImage(ImageReader(b),40,80,width=500,height=700); c.drawString(40,40,'generated test page '+str(n+1)); c.showPage()
c.save()`,pdf],{windowsHide:true});
  const hash=b=>createHash('sha256').update(b).digest('hex'),before=hash(await fs.readFile(pdf));assert.ok((await fs.stat(pdf)).size>850000);
  const delivery=await workerCall(python,{action:'delivery',source:pdf});assert.ok(delivery.files.length>1);let next=1;
  for(const f of delivery.files){assert.ok(f.bytes<=850000);assert.equal((await fs.stat(f.path)).size,f.bytes);assert.equal(f.pages[0],next);next=f.pages[1]+1;}
  assert.equal(next,7);assert.equal(hash(await fs.readFile(pdf)),before);
});
