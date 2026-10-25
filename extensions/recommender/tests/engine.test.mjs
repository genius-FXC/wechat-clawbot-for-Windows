import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseAtom,deduplicate,queryTerms,RecommendationEngine,boundedText} from '../lib/engine.mjs';
import {publicIPv4,proxyAddress} from '../lib/network.mjs';
const xml=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2601.01234v2</id><title>FeSe &amp; pair density wave</title><summary>Scanning tunneling spectroscopy of superconductivity in FeSe.</summary><published>2026-01-10T00:00:00Z</published><author><name>A. Author</name></author><arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1/example</arxiv:doi><category term="cond-mat.supr-con"/></entry></feed>`;
test('Atom keeps canonical IDs, exact metadata, categories and preprint identity',()=>{const rows=parseAtom(xml);assert.equal(rows[0].title,'FeSe & pair density wave');assert.equal(rows[0].id,'2601.01234');assert.equal(rows[0].doi,'10.1/example');assert.deepEqual(rows[0].authors,['A. Author']);assert.equal(rows[0].preprint,true);assert.throws(()=>parseAtom('<!DOCTYPE malicious>'+xml));});
test('deduplication normalizes DOI, title punctuation and arXiv versions',()=>{const rows=parseAtom(xml);for(const library of [[{title:'other',doi:'10.1/example'}],[{title:'FeSe & pair-density wave'}],[{title:'other',url:'https://arxiv.org/pdf/2601.01234v1'}]])assert.equal(deduplicate(rows,library).length,0);assert.ok(queryTerms('FeSe 配对密度波').includes('pair'));});
test('academic proxy accepts only local proxy and public target IP, including fake-IP rejection',()=>{assert.equal(proxyAddress('http://127.0.0.1:7897'),'http://127.0.0.1:7897');assert.throws(()=>proxyAddress('http://proxy.example.com'));assert.throws(()=>proxyAddress('http://user:secret@localhost:7897'));for(const ip of ['127.0.0.1','198.18.3.77','10.0.0.2','169.254.1.1','192.168.1.1','256.1.1.1'])assert.equal(publicIPv4(ip),false);assert.equal(publicIPv4('151.101.3.42'),true);});
test('recommendations use real metadata, cache requests, persist explicit feedback and never upload paper contents',async()=>{
  const root=path.resolve('../../windows/.build/recommender-tests');await fs.mkdir(root,{recursive:true});const home=await fs.mkdtemp(path.join(root,'run-'));let arxiv=0;
  const engine=new RecommendationEngine({home,config:{zoteroUrl:'http://127.0.0.1:23119'},now:()=>100000,fetcher:async(url)=>{if(String(url).includes('arxiv')){arxiv++;assert.ok(!String(url).includes('PRIVATE'));return new Response(xml);}return new Response(JSON.stringify([{key:'ABCDEFGH',data:{itemType:'journalArticle',title:'FeSe magnetic impurity',tags:[],collections:[]}}]),{headers:{'Total-Results':'1'}});}});
  await engine.initialize();const a=await engine.recommend({query:'FeSe'});assert.equal(a.items.length,1);assert.match(a.items[0].reason,/fese/);assert.equal(a.fromCache,false);const b=await engine.recommend({query:'FeSe'});assert.equal(b.fromCache,true);assert.equal(arxiv,1);
  await engine.record(a.items[0].id,'dismiss');assert.equal((await engine.recommend({query:'FeSe'})).items.length,0);
  const restored=new RecommendationEngine({home,config:{zoteroUrl:'http://127.0.0.1:23119'},fetcher:engine.fetcher});await restored.initialize();assert.equal(restored.feedback['2601.01234'].value,'dismiss');
});
test('concurrent identical retrievals share one request; read feedback excludes an article and Chinese ambiguity stays explicit',async()=>{
  const root=path.resolve('../../windows/.build/recommender-tests');await fs.mkdir(root,{recursive:true});const home=await fs.mkdtemp(path.join(root,'concurrent-'));let calls=0,clock=100000;const waits=[];
  const engine=new RecommendationEngine({home,config:{zoteroUrl:'http://127.0.0.1:23119'},now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;},fetcher:async url=>{if(String(url).includes('arxiv')){calls++;await new Promise(r=>setTimeout(r,20));return new Response(xml);}return new Response(JSON.stringify([{key:'ABCDEFGH',data:{itemType:'journalArticle',title:'FeSe Kondo',tags:[],collections:[]}}]));}});
  await engine.initialize();const [a,b]=await Promise.all([engine.recommend({query:'FeSe'}),engine.recommend({query:'FeSe'})]);assert.equal(a.items.length,1);assert.equal(b.items.length,1);assert.equal(calls,1);
  await engine.recommend({query:'Kondo'});assert.equal(calls,2);assert.ok(waits[0]>=3100);
  await engine.record('2601.01234','read');assert.equal((await engine.recommend({query:'FeSe'})).items.length,0);
  await assert.rejects(engine.recommend({query:'未识别的汉字主题'}),/准确英文关键词/);
  const auto=await engine.recommend();assert.ok(auto.query.includes(' OR '));await engine.close();await assert.rejects(engine.recommend({query:'FeSe'}),/已停止/);
});
test('streamed metadata is bounded before parsing and never follows an oversized body',async()=>{await assert.rejects(boundedText(new Response('abcdef'),5),/响应过大/);assert.equal(await boundedText(new Response('真实摘要'),100),'真实摘要');});

test('rapid concurrent explicit feedback persists every latest choice across a restart',async()=>{
  const root=path.resolve('../../windows/.build/recommender-tests');await fs.mkdir(root,{recursive:true});const home=await fs.mkdtemp(path.join(root,'feedback-')),config={zoteroUrl:'http://127.0.0.1:23119'},fetcher=async()=>new Response('[]'),engine=new RecommendationEngine({home,config,fetcher});await engine.initialize();
  const expected={};await Promise.all(Array.from({length:30},(_,n)=>{const id='2501.'+String(n%10).padStart(5,'0'),value=['interested','read','dismiss'][n%3];expected[id]=value;return engine.record(id,value);}));
  await engine.close();const restored=new RecommendationEngine({home,config,fetcher});await restored.initialize();assert.deepEqual(Object.fromEntries(Object.entries(restored.feedback).map(([id,v])=>[id,v.value])),expected);await restored.close();
});
