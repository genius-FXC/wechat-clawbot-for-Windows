import Schema from "@deepseek-ai/schemastery";
export interface LiteratureConfig {papersEnabled:boolean;zoteroUrl:string;paperRulesPath:string;paperPython:string;paperRenderer:string;paperWorkspace:string;}
export const DEFAULT_LITERATURE:LiteratureConfig={papersEnabled:false,zoteroUrl:"http://127.0.0.1:23119",paperRulesPath:"",paperPython:"",paperRenderer:"",paperWorkspace:""};
export const LITERATURE_FIELDS=(Object.keys(DEFAULT_LITERATURE) as (keyof LiteratureConfig)[]);
export const LITERATURE_HOT_FIELDS=LITERATURE_FIELDS.filter(k=>k!=="zoteroUrl"&&k!=="paperWorkspace");
export function normalizeLiterature(r:Record<string,unknown>):LiteratureConfig{return {papersEnabled:r.papersEnabled===true,...Object.fromEntries(LITERATURE_FIELDS.filter(k=>k!=="papersEnabled").map(k=>[k,typeof r[k]==="string"?(r[k] as string).trim().slice(0,2000):DEFAULT_LITERATURE[k]]))} as LiteratureConfig;}
export const LITERATURE_SCHEMA={
  papersEnabled:Schema.boolean().default(false).description("在当前微信主会话启用 Zotero 与论文研读"),
  zoteroUrl:Schema.string().default(DEFAULT_LITERATURE.zoteroUrl).description("Zotero 本地 API 地址，仅接受本机 HTTP"),
  paperRulesPath:Schema.string().default("").description("论文阅读规则 Markdown 的完整路径；每个任务重新读取"),
  paperPython:Schema.string().default("").description("装有 pdfplumber 和 reportlab 的 Python 路径；留空使用 python"),
  paperRenderer:Schema.string().default("").description("Poppler pdftoppm 路径；留空使用 PATH"),
  paperWorkspace:Schema.string().default("").description("派生文件的独立工作区；不写入 Zotero 原件目录，修改后重启生效"),
};
