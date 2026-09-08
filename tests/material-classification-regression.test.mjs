import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMaterialCatalog,defaultTaxonomy} from '../local/material-catalog.mjs';

const asset={id:'fresh',name:'新导入素材',category:'我的素材',tags:['用户导入'],src:'/uploads/fresh.png'};
async function fixture(requestAI){
 const files=new Map([
  ['material-catalog.json',{revision:0,taxonomy:structuredClone(defaultTaxonomy),overrides:{},autoManaged:true}],
  ['material-classification-jobs.json',[]],
 ]);
 const service=await createMaterialCatalog({
  readJSON:async(k,f)=>structuredClone(files.has(k)?files.get(k):f),
  atomic:async(k,v)=>files.set(k,structuredClone(v)),
  readAssets:async()=>[structuredClone(asset)],
  getSettings:()=>({hasKey:true,vision:false}),
  requestAI,
  root:'/tmp',data:'/tmp',
 });
 return service;
}
async function complete(service,job){
 for(let i=0;i<100;i++){
  const next=await service.handle('/api/materials/classify/'+job.id,'GET');
  if(!['queued','running'].includes(next.status))return next;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('classification did not finish');
}

test('single-material classification applies all job proposals when ids are omitted',async()=>{
 const service=await fixture(async()=>({items:[{id:'fresh',group:'装饰贴纸',labels:{content:['植物'],style:[],color:['绿']},confident:true,reason:'图片主体明确'}]}));
 assert.equal(service.decorate([asset])[0].group,undefined);
 const job=await service.handle('/api/materials/classify','POST',{ids:['fresh'],useImages:false});
 const finished=await complete(service,job);
 assert.equal(finished.status,'complete');
 const result=await service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',jobId:job.id});
 assert.equal(result.assets[0].group,'装饰贴纸');
});

test('material library explicitly submits recognized ids when applying a job',async()=>{
 const source=await readFile(new URL('../components/material-library.tsx',import.meta.url),'utf8');
 assert.match(source,/jobId:j\.id,ids:j\.proposals\.map\(p=>p\.id\),revision:snap\.revision/);
});

test('missing AI result keeps a new material unclassified',async()=>{
 let calls=0;
 const service=await fixture(async()=>{calls++;return {items:[]}});
 const job=await service.handle('/api/materials/classify','POST',{ids:['fresh'],useImages:false});
 const finished=await complete(service,job);
 assert.equal(calls,2);
 assert.equal(finished.status,'partial');
 assert.equal(finished.proposals.length,0);
 assert.equal(finished.errors.length,1);
 assert.equal(service.decorate([asset])[0].group,undefined);
});

test('explicit 其他 is a real classification rather than an unclassified fallback',async()=>{
 const service=await fixture(async()=>({items:[{id:'fresh',group:'其他',labels:{content:['几何符号'],style:[],color:['多彩']},confident:true,reason:'不属于已有功能分类'}]}));
 const job=await service.handle('/api/materials/classify','POST',{ids:['fresh'],useImages:false});
 await complete(service,job);
 const result=await service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',jobId:job.id});
 assert.equal(result.assets[0].group,'其他');
});
