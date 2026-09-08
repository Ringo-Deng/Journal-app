import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaterialCatalog,classificationProposals,defaultTaxonomy} from '../local/material-catalog.mjs';
const assets=[{id:'built-in',name:'玫瑰',category:'植物',tags:['玫瑰'],src:'/materials/a.png'},{id:'imported',name:'素材01',category:'我的素材',tags:['用户导入'],src:'/uploads/b.png'}];
async function fixture(requestAI,files=new Map()){
 const batchReply=mapper=>async messages=>{const payload=JSON.parse(typeof messages.at(-1).content==='string'?messages.at(-1).content:messages.at(-1).content[0].text);return {items:payload.items.map(mapper)};};
 const service=await createMaterialCatalog({readJSON:async(k,f)=>structuredClone(files.has(k)?files.get(k):f),atomic:async(k,v)=>files.set(k,structuredClone(v)),readAssets:async()=>structuredClone(assets),getSettings:()=>({hasKey:true,vision:false}),requestAI:requestAI||batchReply(a=>({id:a.id,group:'装饰贴纸',labels:{content:['植物'],style:['复古'],color:['粉']},confident:true,reason:'根据标签'})),root:'/tmp',data:'/tmp'});
 return {service,files};
}
async function complete(service,job){for(let i=0;i<100;i++){const j=await service.handle('/api/materials/classify/'+job.id,'GET');if(!['queued','running'].includes(j.status))return j;await new Promise(r=>setTimeout(r,10));}throw Error('classification did not finish');}
test('manual apply persists group and labels, sets manual flags, keeps original src, revision rejects stale writes',async()=>{
 const {service,files}=await fixture();
 const result=await service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',manual:true,patches:assets.map(a=>({id:a.id,group:'装饰贴纸',labels:{content:['植物'],style:['复古'],color:[]},src:'/uploads/evil.png'}))});
 assert.equal(result.catalog.revision,1);assert.equal(result.assets[0].src,assets[0].src);assert.equal(result.assets[1].category,'我的素材');
 assert.equal(result.assets[0].group,'装饰贴纸');
 assert.deepEqual(result.assets[0].labels,{content:['植物'],style:['复古'],color:[]});
 assert.equal(result.assets[0].manual.group,true);assert.equal(result.assets[0].manual.labels,true);
 assert.ok(result.assets[0].tags.includes('装饰贴纸')&&result.assets[0].tags.includes('植物'));
 const reopened=(await fixture(undefined,files)).service;
 assert.equal(reopened.decorate(assets)[0].group,'装饰贴纸');
 await assert.rejects(()=>service.handle('/api/materials/catalog','POST',{revision:0,action:'add-label',dimension:'content',name:'旧窗口'}),e=>e.status===409);
});
test('apply validates taxonomy words and per-dimension limits',async()=>{
 const {service}=await fixture();
 await assert.rejects(()=>service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',patches:[{id:'built-in',group:'随便编'}]}),e=>e.status===400);
 await assert.rejects(()=>service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',patches:[{id:'built-in',labels:{content:['不存在的标签'],style:[],color:[]}}]}),e=>e.status===400);
 await assert.rejects(()=>service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',patches:[{id:'built-in',labels:{content:['人物','动物','植物','美食','邮票票根','几何符号','文字数字','人物','动物'],style:[],color:[]}}]}),e=>e.status===400);
});
test('add-label dedupes and rejects long names',async()=>{
 const {service}=await fixture();
 const first=await service.handle('/api/materials/catalog','POST',{revision:0,action:'add-label',dimension:'color',name:'奶茶色'});
 assert.ok(first.catalog.taxonomy.labels.color.includes('奶茶色'));
 const second=await service.handle('/api/materials/catalog','POST',{revision:1,action:'add-label',dimension:'color',name:'奶茶色'});
 assert.equal(second.catalog.taxonomy.labels.color.filter(n=>n==='奶茶色').length,1);
 await assert.rejects(()=>service.handle('/api/materials/catalog','POST',{revision:2,action:'add-label',dimension:'color',name:'这是一个非常非常非常长的标签名'}),e=>e.status===400);
});
test('classification proposals are final and apply directly, with uncertain items grouped under 其他',async()=>{
 const {service}=await fixture(async()=>({items:assets.map((a,i)=>({id:a.id,group:i?'装饰贴纸':'',labels:{content:['植物'],style:['复古'],color:['粉']},confident:!!i,reason:i?'看图判断':'无法判断'}))}));
 const job=await service.handle('/api/materials/classify','POST',{ids:assets.map(a=>a.id),useImages:false});
 const finished=await complete(service,job);assert.equal(finished.status,'complete');assert.equal(finished.proposals.length,2);
 assert.equal(finished.proposals[0].group,'其他');assert.equal(finished.proposals[0].review,undefined);assert.equal(finished.proposals[1].review,undefined);
 assert.equal(service.decorate(assets)[0].group,'其他');
 const result=await service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',jobId:job.id,ids:['built-in']});
 assert.equal(result.assets[0].group,'其他');assert.deepEqual(result.assets[0].labels.content,['植物']);
 assert.equal(result.assets[0].review,undefined);
 assert.equal(result.catalog.lastJobId,undefined);
});
test('AI suggestions never overwrite manual group or labels',async()=>{
 const {service}=await fixture();
 await service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',manual:true,patches:[{id:'built-in',group:'纸张',labels:{content:['几何符号'],style:[],color:[]}}]});
 const job=await service.handle('/api/materials/classify','POST',{ids:['built-in'],useImages:false});
 await complete(service,job);
 const result=await service.handle('/api/materials/catalog','POST',{revision:1,action:'apply',jobId:job.id,ids:['built-in']});
 assert.equal(result.assets[0].group,'纸张');
 assert.deepEqual(result.assets[0].labels,{content:['几何符号'],style:[],color:[]});
});
test('AI cannot invent words or silently omit assets',()=>{
 assert.throws(()=>classificationProposals({items:[]},assets,defaultTaxonomy),/数量/);
 assert.throws(()=>classificationProposals({items:assets.map(a=>({id:a.id,group:'随便编造',labels:{content:[],style:[],color:[]},confident:true}))},assets,defaultTaxonomy),/无效主分类/);
 assert.throws(()=>classificationProposals({items:assets.map(a=>({id:a.id,group:'纸张',labels:{content:['编造'],style:[],color:[]},confident:true}))},assets,defaultTaxonomy),/词表/);
 const proposals=classificationProposals({items:assets.map(a=>({id:a.id,group:'',labels:{content:['植物'],style:[],color:[]},confident:true}))},assets,defaultTaxonomy);
 assert.equal(proposals[0].group,'其他');assert.equal(proposals[0].review,undefined);
});

test('AI keeps one label per dimension, records a warning, while manual multi-label data remains supported',async()=>{
 const proposals=classificationProposals({items:assets.map(a=>({id:a.id,group:'装饰贴纸',labels:{content:['植物','人物'],style:['复古','清新'],color:['红','粉']},confident:true,reason:'看图判断'}))},assets,defaultTaxonomy);
 assert.deepEqual(proposals[0].labels,{content:['植物'],style:['复古'],color:['红']});
 assert.equal(proposals[0].warnings.length,3);
 assert.equal(proposals[0].review,undefined);
 const {service}=await fixture();
 const result=await service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',manual:true,patches:[{id:'built-in',group:'装饰贴纸',labels:{content:['植物','人物'],style:['复古','清新'],color:['红','粉']}}]});
 assert.deepEqual(result.assets[0].labels,{content:['植物','人物'],style:['复古','清新'],color:['红','粉']});
});
test('style may be empty without penalty, and missing content or color no longer needs confirmation',()=>{
 const styleEmpty=classificationProposals({items:assets.map(a=>({id:a.id,group:'纸张',labels:{content:['几何符号'],style:[],color:['黑白灰']},confident:true,reason:'形态和颜色明确'}))},assets,defaultTaxonomy);
 assert.equal(styleEmpty[0].confident,true);assert.equal(styleEmpty[0].review,undefined);
 const missingContent=classificationProposals({items:assets.map(a=>({id:a.id,group:'纸张',labels:{content:[],style:[],color:['黑白灰']},confident:true,reason:''}))},assets,defaultTaxonomy);
 assert.equal(missingContent[0].confident,false);assert.equal(missingContent[0].group,'纸张');assert.equal(missingContent[0].review,undefined);
 const missingColor=classificationProposals({items:assets.map(a=>({id:a.id,group:'纸张',labels:{content:['几何符号'],style:[],color:[]},confident:true,reason:''}))},assets,defaultTaxonomy);
 assert.equal(missingColor[0].confident,false);assert.equal(missingColor[0].review,undefined);
});
test('classification prompt requires independent dimensions, strict single labels and a final group for every item',async()=>{
 let checked=false;
 const {service}=await fixture(async messages=>{
  const system=messages[0].content;
  assert.match(system,/逐一、相互独立/);
  assert.match(system,/每个维度最多输出一个标签/);
  assert.match(system,/内容维度严格单标/);
  assert.match(system,/没有任何颜色达到约80%且明显多色混杂，标「多彩」/);
  assert.match(system,/无法判断时主分类一律输出「其他」/);
  assert.match(system,/无需人工确认/);
  assert.doesNotMatch(system,/confident/);
  checked=true;
  const payload=JSON.parse(messages.at(-1).content);
  return {items:payload.items.map(a=>({id:a.id,group:'装饰贴纸',labels:{content:['植物'],style:[],color:['多彩']},reason:'规则测试'}))};
 });
 const job=await service.handle('/api/materials/classify','POST',{ids:['built-in'],useImages:false});
 const finished=await complete(service,job);
 assert.equal(finished.status,'complete');assert.equal(checked,true);assert.deepEqual(finished.proposals[0].labels.color,['多彩']);
});
test('cancelling an active classification does not commit any metadata',async()=>{
 const {service}=await fixture((_m,_a,_d,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true})));
 const job=await service.handle('/api/materials/classify','POST',{ids:assets.map(a=>a.id),useImages:false});
 await new Promise(r=>setTimeout(r,20));
 await service.handle('/api/materials/classify/'+job.id+'/cancel','POST',{});
 assert.equal((await complete(service,job)).status,'cancelled');assert.equal(service.decorate(assets)[0].group,'其他');
});
test('startup migration maps old taxonomy and drops stale override ids',async()=>{
 const files=new Map([['material-catalog.json',{revision:5,taxonomy:{styles:['复古拼贴'],functions:['主题贴纸'],customCategories:[]},overrides:{'built-in':{styles:['复古拼贴'],functions:['主题贴纸'],subjectTags:['玫瑰']},imported:{functions:['胶带']},gone:{functions:['胶带']}}}],['material-classification-jobs.json',[]]]);
 const service=await createMaterialCatalog({readJSON:async(k,f)=>structuredClone(files.has(k)?files.get(k):f),atomic:async(k,v)=>files.set(k,structuredClone(v)),readAssets:async()=>structuredClone(assets),getSettings:()=>({hasKey:true,vision:false}),requestAI:async()=>({items:[]}),root:'/tmp',data:'/tmp'});
 const catalog=await service.handle('/api/materials/catalog','GET');
 assert.deepEqual(catalog.taxonomy,defaultTaxonomy);
 const decorated=service.decorate(assets);
 assert.equal(decorated[0].group,'装饰贴纸');
 assert.equal(decorated[0].review,undefined);
 assert.deepEqual(decorated[0].labels.style,['复古']);
 assert.ok(decorated[0].tags.includes('玫瑰'));
 assert.equal(decorated[1].group,'胶带');
 assert.equal(decorated[1].review,undefined);
 assert.equal(files.get('material-catalog.json').overrides.gone,undefined);
 // 迁移只发生一次：再次加载不重复改写。
 files.set('material-catalog.json',{...files.get('material-catalog.json'),overrides:{}});
 const again=await createMaterialCatalog({readJSON:async(k,f)=>structuredClone(files.get(k)),atomic:async(k,v)=>files.set(k,structuredClone(v)),readAssets:async()=>structuredClone(assets),getSettings:()=>({hasKey:true,vision:false}),requestAI:async()=>({items:[]}),root:'/tmp',data:'/tmp'});
 assert.deepEqual((await again.handle('/api/materials/catalog','GET')).taxonomy,defaultTaxonomy);
 assert.deepEqual(files.get('material-catalog.json').overrides,{});
});
test('legacy classification jobs are not surfaced as current suggestions',async()=>{
 const files=new Map([['material-classification-jobs.json',[{id:'old-job',status:'complete',revision:0,total:1,done:1,proposals:[{id:'built-in',group:'装饰贴纸',labels:{content:['植物'],style:['写实','复古'],color:['粉','绿']},confident:true}],errors:[]}]]]);
 const {service}=await fixture(undefined,files);
 const catalog=await service.handle('/api/materials/catalog','GET');
 assert.equal(catalog.lastJobId,undefined);
 const job=await service.handle('/api/materials/classify','POST',{ids:['built-in'],useImages:false});
 const finished=await complete(service,job);
 assert.equal((await service.handle('/api/materials/catalog','GET')).lastJobId,finished.id);
});

test('v0.1.6 does not resurface v0.1.5 classifier suggestions',async()=>{
 const files=new Map([['material-classification-jobs.json',[{id:'v2-job',classifierVersion:'2026-09-07-single-label-v2',status:'complete',revision:0,total:1,done:1,proposals:[{id:'built-in',group:'装饰贴纸',labels:{content:['植物'],style:[],color:['多彩']},confident:true}],errors:[]}]]]);
 const {service}=await fixture(undefined,files);
 assert.equal((await service.handle('/api/materials/catalog','GET')).lastJobId,undefined);
 const job=await service.handle('/api/materials/classify','POST',{ids:['built-in'],useImages:false});
 const finished=await complete(service,job);
 assert.notEqual(finished.classifierVersion,'2026-09-07-single-label-v2');
 assert.equal((await service.handle('/api/materials/catalog','GET')).lastJobId,finished.id);
});

test('preview-adjusted AI patches still respect manual protection',async()=>{
 const {service}=await fixture();
 await service.handle('/api/materials/catalog','POST',{revision:0,action:'apply',manual:true,patches:[{id:'built-in',group:'纸张',labels:{content:['几何符号'],style:[],color:['黑白灰']}}]});
 const job=await service.handle('/api/materials/classify','POST',{ids:['built-in'],useImages:false});
 await complete(service,job);
 const result=await service.handle('/api/materials/catalog','POST',{revision:1,action:'apply',jobId:job.id,patches:[{id:'built-in',group:'装饰贴纸',labels:{content:['植物'],style:['复古'],color:['粉']},review:{pending:false}}]});
 assert.equal(result.assets[0].group,'纸张');
 assert.deepEqual(result.assets[0].labels,{content:['几何符号'],style:[],color:['黑白灰']});
});
