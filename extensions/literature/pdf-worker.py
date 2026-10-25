"""Read source PDFs and write only plugin-owned derived files. JSON stdin/stdout."""
import json, sys, os, hashlib, subprocess, re
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')

def extract(a):
    import pdfplumber
    source=Path(a['source']); out=Path(a['out']); out.mkdir(parents=True,exist_ok=True)
    if source.stat().st_size>80*1024*1024: raise ValueError('PDF exceeds 80 MB limit')
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    pages=[]; ordered=None; backend='pdfplumber'
    extractor=a.get('textExtractor')
    if extractor and Path(extractor).is_file():
        r=subprocess.run([extractor,'-enc','UTF-8',str(source),'-'],capture_output=True,timeout=110)
        if r.returncode==0:
            ordered=r.stdout.decode('utf-8','replace').split('\f');backend='poppler-reading-order'
    with pdfplumber.open(source) as pdf:
        if len(pdf.pages)>600: raise ValueError('PDF exceeds 600 pages; select a chapter first')
        for n,p in enumerate(pdf.pages,1):
            text=(ordered[n-1] if ordered is not None and n<=len(ordered) else p.extract_text(layout=False,x_tolerance=2,y_tolerance=3)) or ''
            # Caption-only crops avoid including unrelated following body text
            # when a referenced figure is physically on a later page. Some PDFs
            # do not distinguish caption typography; those remain image-only.
            words=p.extract_words(extra_attrs=['fontname','size']); figures=[]
            for i,w in enumerate(words):
                if not re.fullmatch(r'Fig\.?',w['text']) or not re.search(r'Bold|Bd',w['fontname'],re.I):continue
                following=[v for v in words if abs(v['top']-w['top'])<1.5 and v['x0']>=w['x1']][:3]
                if not following or not re.fullmatch(r'\d{1,2}',following[0]['text']):continue
                preceding=[v['text'] for v in words[max(0,i-3):i] if abs(v['top']-w['top'])<1.5]
                label=('extended:' if 'Extended' in preceding and 'Data' in preceding else 'figure:')+following[0]['text']
                larger=[c['top'] for c in p.chars if c['top']>w['top']+8 and c['size']>w['size']*1.12]
                bottom=min(larger) if larger else p.height-22
                if bottom-w['top']<10:continue
                crop=p.crop((0,max(0,w['top']-2),p.width,min(p.height,bottom-1)))
                caption=crop.extract_text(layout=False) or ''
                if len(caption)>5000:continue
                figures.append({'label':label,'caption':caption,'bbox':[0,w['top']-2,p.width,bottom-1]})
            pages.append({'page':n,'text':text,'images':len(p.images),'figures':figures,'width':p.width,'height':p.height,'needsOCR':len(re.sub(r'\s','',text))<60})
    warnings=['部分页面文字很少，可能需要看图或 OCR；不能据此宣称已完整阅读。'] if any(p['needsOCR'] for p in pages) else []
    if backend=='pdfplumber':warnings.append('使用基础文字抽取；双栏、公式与图表的阅读顺序还需要对照页面图像。')
    data={'sha256':digest,'pages':pages,'warnings':warnings,'textBackend':backend,'extractorVersion':2}
    (out/'pages.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    return {'sha256':digest,'pageCount':len(pages),'warnings':data['warnings'],'textBackend':backend}

def render(a):
    out=Path(a['out']); out.mkdir(parents=True,exist_ok=True)
    prefix=out/('page-'+str(a['page']))
    exe=a.get('renderer') or 'pdftoppm'
    r=subprocess.run([exe,'-f',str(a['page']),'-l',str(a['page']),'-singlefile','-scale-to','1800','-png',a['source'],str(prefix)],capture_output=True,timeout=60)
    if r.returncode: raise ValueError('PDF 页面渲染失败；请检查 Poppler')
    return {'path':str(prefix)+'.png'}

def delivery(a):
    from pypdf import PdfReader, PdfWriter
    from io import BytesIO
    source=Path(a['source']);limit=850000
    if source.stat().st_size<=limit:return {'files':[{'path':str(source),'bytes':source.stat().st_size}]}
    reader=PdfReader(source);groups=[];writer=PdfWriter();start=1
    def serialize(w):
        buf=BytesIO();w.write(buf);return buf.getvalue()
    prior=b''
    for index,page in enumerate(reader.pages,1):
        writer.add_page(page);candidate=serialize(writer)
        if len(candidate)>limit:
            if not prior:return {'files':[],'warning':'单页 PDF 超过微信文件通道大小；可先发送 Markdown，完整 PDF 仍保留在本机。'}
            groups.append((start,index-1,prior));writer=PdfWriter();writer.add_page(page);start=index;candidate=serialize(writer)
            if len(candidate)>limit:return {'files':[],'warning':'单页 PDF 超过微信文件通道大小；可先发送 Markdown，完整 PDF 仍保留在本机。'}
        prior=candidate
    if prior:groups.append((start,len(reader.pages),prior))
    files=[]
    for n,(first,last,data) in enumerate(groups,1):
        target=source.with_name(source.stem+f'-volume-{n}.pdf');target.write_bytes(data);files.append({'path':str(target),'bytes':len(data),'pages':[first,last]})
    return {'files':files,'note':'较大报告已按页分卷，完整报告与 Markdown 均保留。'}

def export(a):
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from xml.sax.saxutils import escape
    class PaperParagraph(Paragraph):
        def __init__(self,*args,**kwargs):
            super().__init__(*args,**kwargs)
            # ReportLab's CJK line splitter calls ord() on an empty image
            # fragment at line boundaries. The object replacement character
            # keeps its width; ReportLab still draws the image callback.
            for frag in self.frags:
                if not getattr(frag,'text',None) and getattr(getattr(frag,'cbDefn',None),'kind',None)=='img':frag.text='\ufffc'
    Paragraph=PaperParagraph
    # Embedded Unicode font, readable offline on a phone.
    font=a.get('font') or ('C:/Windows/Fonts/msyh.ttc' if os.name=='nt' else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    pdfmetrics.registerFont(TTFont('PaperText',font,subfontIndex=0))
    target=Path(a['target']); text=Path(a['markdown']).read_text(encoding='utf-8')
    equations={}
    pattern=r'\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)|(?<!\$)\$[^$\n]+\$(?!\$)'
    matches=list(re.finditer(pattern,text))
    if matches:
        if not a.get('node') or not a.get('mathRenderer'):raise ValueError('公式排版器不可用；原始 Markdown 已保留')
        request={'out':str(target.with_suffix(''))+'-math','equations':[]}
        for m in matches:
            raw=m[0];display=raw.startswith('\\[') or raw.startswith('$$');trim=2 if raw.startswith('\\') or display else 1
            request['equations'].append({'raw':raw,'value':raw[trim:-trim],'display':display})
        r=subprocess.run([a['node'],a['mathRenderer'],'--worker'],input=json.dumps(request,ensure_ascii=False).encode('utf-8'),capture_output=True,timeout=60)
        result=json.loads(r.stdout.decode('utf-8'))
        if r.returncode or not result.get('ok'):raise ValueError('公式排版失败：'+str(result.get('error','unknown')))
        equations={e['raw']:e for e in result['equations']}
        text=re.sub(r'\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$',lambda m:'\n\n\\[\n'+(m[1] if m[1] is not None else m[2]).strip()+'\n\\]\n\n',text)
    greek={'Delta':'Δ','delta':'δ','lambda':'λ','pi':'π','sigma':'σ','phi':'φ','varphi':'φ','theta':'θ','mu':'μ','alpha':'α','beta':'β','gamma':'γ','omega':'ω','Omega':'Ω','epsilon':'ε','varepsilon':'ε','eta':'η','rho':'ρ','tau':'τ','nu':'ν','chi':'χ','approx':'≈','simeq':'≃','equiv':'≡','times':'×','cdot':'·','pm':'±','int':'∫','sum':'∑','infty':'∞','leq':'≤','geq':'≥','neq':'≠','to':'→','partial':'∂','angle':'∠','circ':'°'}
    def math(value):
        value=value.replace('\\left','').replace('\\right','').replace('\\,',' ').replace('\\;',' ').replace('\\!','')
        value=re.sub(r'\\(?:mathrm|mathbf|mathit|operatorname|text)\s*\{([^{}]*)\}',r'\1',value)
        value=re.sub(r'\\rm\s*', '',value)
        value=re.sub(r'\\([A-Za-z]+)',lambda m:greek.get(m[1],'\\'+m[1]),value)
        # Fractions keep explicit numerator/denominator grouping in the PDF;
        # the original LaTeX remains verbatim in the accompanying Markdown.
        for _ in range(5):
            changed=re.sub(r'\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}',r'(\1)/(\2)',value)
            if changed==value:break
            value=changed
        value=re.sub(r'\\sqrt\s*\{([^{}]*)\}',r'√(\1)',value)
        value=escape(value.strip())
        value=re.sub(r'([_^])\s*\{([^{}]*)\}',lambda m:'<sub>'+m[2]+'</sub>' if m[1]=='_' else '<sup>'+m[2]+'</sup>',value)
        value=re.sub(r'([_^])([A-Za-z0-9])',lambda m:'<sub>'+m[2]+'</sub>' if m[1]=='_' else '<sup>'+m[2]+'</sup>',value)
        return value.replace('{','').replace('}','')
    def inline(value):
        parts=re.split(r'(\\\([\s\S]*?\\\)|\$[^$\n]+\$)',value)
        rendered=[]
        for p in parts:
            if p in equations:
                e=equations[p];rendered.append('<img src="'+escape(e['path'])+'" width="'+str(e['width'])+'" height="'+str(e['height'])+'" valign="middle"/>')
            elif p.startswith('\\('):rendered.append(math(p[2:-2]))
            elif p.startswith('$') and p.endswith('$'):rendered.append(math(p[1:-1]))
            else:rendered.append(escape(p))
        value=''.join(rendered)
        value=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',value)
        value=re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)',r'<i>\1</i>',value)
        return value
    body=ParagraphStyle('body',fontName='PaperText',fontSize=11,leading=18,spaceAfter=10,wordWrap='CJK',autoLeading='max')
    heading=ParagraphStyle('heading',parent=body,fontSize=13.5,leading=21,spaceBefore=12,spaceAfter=9,keepWithNext=True)
    title=ParagraphStyle('title',parent=heading,fontSize=17,leading=25,spaceBefore=0,spaceAfter=16)
    equation=ParagraphStyle('equation',parent=body,alignment=TA_CENTER,spaceBefore=6,spaceAfter=12)
    blocks=[]; buffer=[]; math_buffer=[]; in_math=False
    def flush():
        if buffer:blocks.append(Paragraph(inline(' '.join(buffer)),body));buffer.clear()
    def display_math(value,delimiter):
        raw=delimiter+'\n'+value+'\n'+('\\]' if delimiter=='\\[' else '$$');e=equations.get(raw)
        if not e:e=next((v for v in equations.values() if v['display'] and v['value'].strip()==value.strip()),None)
        if not e:raise ValueError('公式与排版结果未对应，Markdown 已保留')
        scale=min(1,(A4[0]-84)/e['width']);blocks.append(Image(e['path'],width=e['width']*scale,height=e['height']*scale,hAlign='CENTER'));blocks.append(Spacer(1,10))
    lines=text.splitlines()
    # Avoid two near-identical titles added by the export envelope and model.
    if lines and lines[0].startswith('# ') and any(l.startswith('# ') for l in lines[1:5]):lines=lines[1:]
    delimiter=''
    for raw in lines:
        if raw.strip() in ['\\[','$$'] and not in_math:flush();in_math=True;delimiter=raw.strip();math_buffer=[];continue
        if raw.strip() in ['\\]','$$'] and in_math:display_math('\n'.join(math_buffer),delimiter);in_math=False;continue
        if in_math:math_buffer.append(raw);continue
        if not raw.strip():flush();continue
        if raw.startswith('#'):
            flush();level=len(raw)-len(raw.lstrip('#'));blocks.append(Paragraph(inline(raw.lstrip('#').strip()),title if level==1 else heading));continue
        if raw.strip()=='---':flush();blocks.append(Spacer(1,12));continue
        if raw.startswith('- '):flush();blocks.append(Paragraph('• '+inline(raw[2:]),body));continue
        buffer.append(raw)
    flush()
    if in_math:raise ValueError('公式分隔符未闭合，Markdown 已保留')
    def footer(c,doc):c.setFont('PaperText',8);c.drawRightString(A4[0]-42,24,str(doc.page))
    SimpleDocTemplate(str(target),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=44,bottomMargin=44,title=a.get('title','论文研读')).build(blocks,onFirstPage=footer,onLaterPages=footer)
    parts=delivery({'source':str(target)})
    return {'path':str(target),'bytes':target.stat().st_size,'deliveryFiles':parts['files'],'deliveryNote':parts.get('warning') or parts.get('note')}

try:
    arg=json.load(sys.stdin)
    result={'extract':extract,'render':render,'export':export,'delivery':delivery}[arg.pop('action')](arg)
    print(json.dumps({'ok':True,**result},ensure_ascii=False))
except Exception as e:
    if os.environ.get('CLAWBOT_PDF_DEBUG')=='1':
        import traceback
        traceback.print_exc(file=sys.stderr)
    print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False));sys.exit(1)
