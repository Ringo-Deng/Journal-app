import test from 'node:test';
import assert from 'node:assert/strict';
import { JournalApiError, saveJournalSnapshot, shouldShowSaveStatus } from '../lib/journal-save.ts';

const snapshot={books:[{id:'one',title:'my edit'}],revision:1};
test('the save bar stays out of the layout unless the user needs to act',()=>{
 assert.equal(shouldShowSaveStatus('已保存到本机'),false);
 assert.equal(shouldShowSaveStatus('等待保存…'),false);
 assert.equal(shouldShowSaveStatus('正在保存…'),false);
 assert.equal(shouldShowSaveStatus('已保存 · 历史备份未完成'),true);
 assert.equal(shouldShowSaveStatus('保存失败 · 点击重试'),true);
 assert.equal(shouldShowSaveStatus('保存冲突 · 本窗口内容已保留'),true);
});
test('normal save returns revision and backup warning without an extra read',async()=>{
 const result=await saveJournalSnapshot(snapshot,{write:async()=>({revision:2,historyWarning:'disk full'}),read:async()=>{throw Error('unexpected read');}});
 assert.deepEqual(result,{revision:2,historyWarning:'disk full'});
});
test('a lost success response is acknowledged only when saved content matches',async()=>{
 let writes=0;
 const result=await saveJournalSnapshot(snapshot,{write:async()=>{writes++;throw new TypeError('connection lost');},read:async()=>({...structuredClone(snapshot),revision:2})});
 assert.equal(result.revision,2);assert.equal(writes,1);
});
test('another window changes content: preserve conflict, never retry with its revision',async()=>{
 let writes=0;
 await assert.rejects(saveJournalSnapshot(snapshot,{write:async()=>{writes++;throw new JournalApiError('conflict',409);},read:async()=>({books:[{id:'one',title:'other window'}],revision:2})}),e=>e.status===409);
 assert.equal(writes,1);assert.equal(snapshot.books[0].title,'my edit');
});
test('network failure with unchanged server remains retryable',async()=>{
 const failure=new TypeError('offline');
 await assert.rejects(saveJournalSnapshot(snapshot,{write:async()=>{throw failure;},read:async()=>({books:[],revision:1})}),e=>e===failure);
});
test('failed reconciliation and invalid payloads preserve the original error',async()=>{
 const conflict=new JournalApiError('conflict',409);
 await assert.rejects(saveJournalSnapshot(snapshot,{write:async()=>{throw conflict;},read:async()=>{throw Error('offline');}}),e=>e===conflict);
 const invalid=new JournalApiError('invalid',400);
 await assert.rejects(saveJournalSnapshot(snapshot,{write:async()=>{throw invalid;},read:async()=>{assert.fail('must not read');}}),e=>e===invalid);
});
