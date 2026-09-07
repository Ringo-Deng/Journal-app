export function designOptions(baseUrl, attempt = 0) {
  const deepseek = new URL(baseUrl).hostname === 'api.deepseek.com';
  return {
    temperature: 0.4,
    max_tokens: attempt ? 24000 : 18000,
    ...(deepseek ? {response_format:{type:'json_object'}, thinking:{type:'disabled'}} : {}),
  };
}
export function parseDesign(result) {
  const choice = result?.choices?.[0];
  if(choice?.finish_reason === 'length') throw Object.assign(Error('AI 输出达到长度上限，设计尚未写完。'),{code:'truncated'});
  if(choice?.finish_reason === 'content_filter' || choice?.message?.refusal) throw Object.assign(Error('AI 服务未提供本次设计。'),{code:'refused'});
  const content = choice?.message?.content;
  const text = typeof content==='string' ? content : Array.isArray(content) ? content.filter(p=>p.type==='text').map(p=>p.text).join('\n') : '';
  if(!text.trim()) throw Object.assign(Error('AI 没有返回最终排版内容。'),{code:'empty'});
  const clean=text.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
  let output;
  try {output=JSON.parse(clean);}
  catch {
    // Accept a complete JSON object wrapped in explanatory text, never partial JSON.
    try {output=JSON.parse(clean.slice(clean.indexOf('{'),clean.lastIndexOf('}')+1));}
    catch {throw Object.assign(Error('AI 返回的排版 JSON 格式不完整。'),{code:'invalid_json'});}
  }
  if(!output || Array.isArray(output) || typeof output!=='object') throw Object.assign(Error('AI 返回的排版结构无效。'),{code:'invalid_json'});
  return output;
}
