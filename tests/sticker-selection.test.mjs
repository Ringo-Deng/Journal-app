import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStickers} from '../local/sticker-selection.mjs';
import {layoutPrompt} from '../local/layout-prompt.mjs';
test('unmatched diary topics still get a diverse material selection',()=>{
 const assets=Array.from({length:70},(_,i)=>({id:String(i),name:'玫瑰',category:'花卉',tags:[]}));
 assets.push({id:'ticket',name:'票根',category:'票根',tags:[]},{id:'paper',name:'纸片',category:'纸张',tags:[]});
 const picks=selectStickers(assets,'吃牛排',[],8);
 assert.equal(picks.length,8);assert.ok(picks.some(a=>a.id==='ticket'));assert.ok(picks.some(a=>a.id==='paper'));
});
test('colour harmony can rank a sticker above a literal topic match',()=>{
 const assets=[{id:'literal',name:'咖啡',tags:['咖啡'],colors:['#0011ff'],category:'饮品'},{id:'warm',name:'旧票根',tags:[],colors:['#b89060'],category:'纸张'}];
 const selected=selectStickers(assets,'喝咖啡',['#b89060'],2);
 assert.equal(selected[0].id,'warm');
 assert.match(layoutPrompt(selected),/#b89060/);assert.match(layoutPrompt(selected),/绝不是必须命中/);
});
test('empty or malformed palette metadata does not prevent selection',()=>{
 const assets=[{id:'a',name:'纸张',category:'纸张',tags:[],colors:['bad']}];
 assert.equal(selectStickers(assets,'',['bad'],48).length,1);
 assert.deepEqual(selectStickers([],''),[]);
});
