import test from 'node:test';
import assert from 'node:assert/strict';
import {designOptions,parseDesign} from '../local/ai-response.mjs';
const response=(content,finish_reason='stop')=>({choices:[{message:{content},finish_reason}]});
test('DeepSeek layout generation explicitly uses JSON and non-thinking mode',()=>{
 const settings=designOptions('https://api.deepseek.com');
 assert.deepEqual(settings.response_format,{type:'json_object'});
 assert.deepEqual(settings.thinking,{type:'disabled'});
 assert.ok(designOptions('https://api.deepseek.com',1).max_tokens>settings.max_tokens);
 assert.equal(designOptions('https://example.com/v1').thinking,undefined);
});
test('distinguishes truncation, empty final content, malformed JSON and refusal',()=>{
 assert.throws(()=>parseDesign(response('', 'length')),e=>e.code==='truncated');
 assert.throws(()=>parseDesign({choices:[{message:{content:'',reasoning_content:'internal reasoning'}}]}),e=>e.code==='empty');
 assert.throws(()=>parseDesign(response('{"elements":[')),e=>e.code==='invalid_json');
 assert.throws(()=>parseDesign(response('', 'content_filter')),e=>e.code==='refused');
});
test('accepts complete JSON in code fences or content parts without interpreting markup',()=>{
 const output={elements:[],days:[]};
 assert.deepEqual(parseDesign(response('```json\n'+JSON.stringify(output)+'\n```')),output);
 assert.deepEqual(parseDesign(response('设计如下：\n'+JSON.stringify(output))),output);
 assert.deepEqual(parseDesign(response([{type:'text',text:JSON.stringify(output)}])),output);
});
