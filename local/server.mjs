import {tidyLayout} from '../lib/layout-safety.mjs';
import {nextMaterialStrategy} from '../lib/material-retry.mjs';
import {finishCollage} from './collage-layout.mjs';
import {selectStickers} from './sticker-selection.mjs';
import {layoutPrompt} from './layout-prompt.mjs';
import {designRecords} from './design-records.mjs';
import {createMaterialCatalog} from './material-catalog.mjs';
import {artPrompt} from './art-direction.mjs';
import { editorialPrompt, prepareEditorial, checkParagraphDesign, requiredEditorialSources, isEmptyTextHint } from './editorial.mjs';
import { designOptions, parseDesign } from './ai-response.mjs';
import { validatePlan } from './design-plan.mjs';
import { parsePinterestInput, resolvePinterestPin, downloadPinterestImage } from './pinterest-import.mjs';
import { normalizeBaseUrl, configIssue, providerError, migrateLegacyConfig, DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_MODELS } from './ai-config.mjs';
import { createJournalHistory } from './journal-history.mjs';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  stat,
  copyFile,
  unlink,
} from 'node:fs/promises';
import { resolve, dirname, extname, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { platform } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { access, constants as fsConstants } from 'node:fs/promises';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = process.env.JOURNAL_DATA_DIR || resolve(root, 'data');
const configData = process.env.JOURNAL_CONFIG_DIR || data;
const port = Number(process.env.JOURNAL_PORT || 4329);
const webPort = Number(process.env.JOURNAL_WEB_PORT || 4330);
await mkdir(resolve(data, 'uploads'), { recursive: true, mode: 0o700 });
await mkdir(configData, { recursive: true, mode: 0o700 });
const userFontsDir = resolve(data, 'user-fonts');
await mkdir(userFontsDir, { recursive: true, mode: 0o700 });
const readJSON = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(data, file), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
};
const atomicAt = async (dir, file, obj) => {
  const target = resolve(dir, file),
    temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  await rename(temp, target);
};
const atomic = (file, obj) => atomicAt(data, file, obj);
const readConfigJSON = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(configData, file), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
};
let state = await readJSON('journal.json', { revision: 0, books: [] });
const journalHistory = createJournalHistory({ data, atomicAt, validate: validateState });
function consolidatedJobs(jobs){
  const sources=[...new Set(jobs.map(j=>j.source))];
  return sources.map(source=>{const group=jobs.filter(j=>j.source===source);const base=group.find(j=>!j.rect)||group[0];const retained=group.flatMap(j=>j.items.filter(i=>i.imported||j.rect).map(i=>({...i,manual:!!j.rect||i.manual})));return {...base,items:[...new Map([...base.items,...retained].map(i=>[i.id,i])).values()]};});
}
let settings = await readConfigJSON('settings.json', {
  baseUrl: 'https://api.deepseek.com',
  model: DEEPSEEK_DEFAULT_MODEL,
  apiKey: '',
  vision: true,
});
{
  const migrated = migrateLegacyConfig(settings);
  settings = migrated.config;
  if (migrated.changed) await atomicAt(configData, 'settings.json', settings);
}
const nativeImageTool = async (name) => {
  if (platform() !== 'darwin' || process.arch !== 'arm64') return false;
  try {
    await access(resolve(root, 'local', name), fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};
const nativeCapabilities = {
  segment: await nativeImageTool('segment'),
  cutout: await nativeImageTool('cutout'),
  palette: await nativeImageTool('material-palette'),
  cleanPaper: await nativeImageTool('clean-paper'),
};
const FONT_EXTS=new Set(['.ttf','.otf','.woff','.woff2']);
const FONT_MIME={'.ttf':'font/ttf','.otf':'font/otf','.woff':'font/woff','.woff2':'font/woff2'};
let userFonts=(await readJSON('fonts.json',[])).filter(font=>font&&/^[a-f0-9]{24}$/.test(font.id)&&FONT_EXTS.has(font.ext)&&typeof font.name==='string');
const fontPublic=font=>({id:font.id,name:font.name,family:`Journal User ${font.id}`,url:`/api/fonts/file/${font.id}`,size:font.size,originalName:font.originalName});
const cleanFontName=name=>basename(String(name||'字体')).replace(/\.(ttf|otf|woff2?|zip)$/i,'').replace(/[-_]+(regular|medium|book|normal)$/i,'').replace(/[_-]+/g,' ').trim().slice(0,80)||'我的字体';
function validFont(buffer,ext){
  if(buffer.length<4)return false;
  const head=buffer.subarray(0,4);
  if(ext==='.ttf')return head.equals(Buffer.from([0,1,0,0]))||head.toString('ascii')==='true';
  if(ext==='.otf')return head.toString('ascii')==='OTTO';
  if(ext==='.woff')return head.toString('ascii')==='wOFF';
  if(ext==='.woff2')return head.toString('ascii')==='wOF2';
  return false;
}
async function rawBody(req,max=80*1024*1024){
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>max)throw error('字体文件过大。',413);chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function persistFont(buffer,originalName){
  const ext=extname(originalName).toLowerCase();
  if(!FONT_EXTS.has(ext))throw error('仅支持 TTF、OTF、WOFF 或 WOFF2 字体。');
  if(buffer.length>32*1024*1024)throw error(`${originalName} 超过 32 MB，未导入。`,413);
  if(!validFont(buffer,ext))throw error(`${originalName} 不是有效的字体文件。`);
  const sha=createHash('sha256').update(buffer).digest('hex');
  const existing=userFonts.find(font=>font.sha===sha);
  if(existing)return existing;
  const id=sha.slice(0,24);
  const target=resolve(userFontsDir,id+ext);
  await writeFile(target,buffer,{mode:0o600});
  const font={id,name:cleanFontName(originalName),originalName:basename(originalName).slice(0,160),ext,sha,size:buffer.length,createdAt:new Date().toISOString()};
  userFonts=[...userFonts,font].slice(-120);
  await atomic('fonts.json',userFonts);
  return font;
}
function zipFontEntries(buffer){
  const eocdSig=0x06054b50,centralSig=0x02014b50,localSig=0x04034b50;
  let eocd=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===eocdSig){eocd=i;break;}
  if(eocd<0)throw error('ZIP 字体包格式不正确。');
  const count=buffer.readUInt16LE(eocd+10),centralOffset=buffer.readUInt32LE(eocd+16);
  if(count>200)throw error('字体包文件过多。');
  let offset=centralOffset,total=0;const entries=[];
  for(let n=0;n<count;n++){
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==centralSig)throw error('ZIP 字体包目录损坏。');
    const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),compressed=buffer.readUInt32LE(offset+20),uncompressed=buffer.readUInt32LE(offset+24);
    const nameLen=buffer.readUInt16LE(offset+28),extraLen=buffer.readUInt16LE(offset+30),commentLen=buffer.readUInt16LE(offset+32),localOffset=buffer.readUInt32LE(offset+42);
    const filename=buffer.subarray(offset+46,offset+46+nameLen).toString('utf8');
    offset+=46+nameLen+extraLen+commentLen;
    const ext=extname(filename).toLowerCase();
    if(!FONT_EXTS.has(ext))continue;
    if(flags&1)throw error('不支持加密的 ZIP 字体包。');
    if(![0,8].includes(method))throw error(`字体包中的 ${basename(filename)} 使用了不支持的压缩方式。`);
    if(uncompressed>32*1024*1024)throw error(`${basename(filename)} 超过 32 MB，未导入。`,413);
    total+=uncompressed;if(total>100*1024*1024)throw error('字体包解压后过大。',413);
    if(localOffset+30>buffer.length||buffer.readUInt32LE(localOffset)!==localSig)throw error('ZIP 字体包内容损坏。');
    const localName=buffer.readUInt16LE(localOffset+26),localExtra=buffer.readUInt16LE(localOffset+28),start=localOffset+30+localName+localExtra,end=start+compressed;
    if(end>buffer.length)throw error('ZIP 字体包内容不完整。');
    const raw=buffer.subarray(start,end);
    const data=method===0?Buffer.from(raw):inflateRawSync(raw,{maxOutputLength:32*1024*1024});
    if(uncompressed&&data.length!==uncompressed)throw error(`${basename(filename)} 解压失败。`);
    entries.push({name:basename(filename),data});
    if(entries.length>30)throw error('一次最多导入 30 个字体。');
  }
  return entries;
}
let customAssets = await readJSON('materials.json', []);
let materialJobs = await readJSON('material-jobs.json', []);
materialJobs=consolidatedJobs(materialJobs);
let pinterestImports = await readJSON('pinterest-imports.json', []);
const pinterestBySrc = (src) => pinterestImports.find((item) => item.src === src) || null;
const pinterestSourceMeta = (record) => record ? ({
  type: 'pinterest', pinId: record.pinId, originalUrl: record.originalUrl, imageUrl: record.imageUrl, sha256: record.sha256,
}) : undefined;
let materialQueue = Promise.resolve();
function materialWrite(fn) {
  const task = materialQueue.then(fn);
  materialQueue = task.catch(() => {});
  return task;
}
async function rawLibrary() {
  return [
    ...JSON.parse(
      await readFile(resolve(root, 'public/materials/manifest.json'), 'utf8'),
    ),
    ...customAssets,
  ];
}
const paletteCache=new Map();
async function withMaterialColors(assets){
 const pending=assets.filter(a=>!paletteCache.has(a.src)&&/^\/(materials|uploads)\/[a-zA-Z0-9._-]+$/.test(a.src));
 if(pending.length && nativeCapabilities.palette){
  const paths=pending.map(a=>resolve(a.src.startsWith('/uploads/')?data:resolve(root,'public'),'.'+a.src));
  try{const r=await run(resolve(root,'local/material-palette'),paths,{timeout:20000,maxBuffer:1024*1024});const colors=JSON.parse(r.stdout);pending.forEach((a,i)=>paletteCache.set(a.src,colors[paths[i]]||[]));}catch{/* Colour metadata is optional; never block a design on extraction. */}
 }
 return assets.map(a=>({...a,colors:paletteCache.get(a.src)||[]}));
}
async function library(){const assets=await rawLibrary();return catalogService?catalogService.decorate(assets):assets;}
let writeQueue = Promise.resolve();
const publicSettings = () => ({
  baseUrl: settings.baseUrl,
  model: settings.model,
  hasKey: !!settings.apiKey,
  vision: !!settings.vision,
  configurationIssue: configIssue(settings),
  provider: 'deepseek',
  models: DEEPSEEK_MODELS,
});
const error = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const json = (res, obj, status = 200) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
};
async function body(req) {
  if (!String(req.headers['content-type']).startsWith('application/json'))
    throw error('请使用 JSON 请求。', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 18 * 1024 * 1024)
      throw error('内容过大，请减少照片或文字。', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw error('请求格式不正确。');
  }
}
function validateState(s) {
  if (!s || !Array.isArray(s.books) || s.books.length > 240)
    throw error('手帐数据格式不正确。');
  const bookIds = new Set();
  for (const book of s.books) {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(book.month) ||
      typeof book.id !== 'string' ||
      typeof book.title !== 'string' ||
      !Array.isArray(book.spreads) ||
      book.spreads.length > 1000 ||
      bookIds.has(book.id)
    )
      throw error('笔记本格式不正确。');
    bookIds.add(book.id);
    /* 保留旧护照数据，但不接受未知开本。 */
    if (
      book.format !== undefined &&
      !['standard', 'tn-regular', 'tn-passport'].includes(book.format)
    )
      throw error('笔记本格式不正确。');
    const checkSpread = (spread) => {
      if (
        !Array.isArray(spread.days) ||
        spread.days.length > 100 ||
        !Array.isArray(spread.elements) ||
        spread.elements.length > 300
      )
        throw error('跨页格式不正确。');
      for (const day of spread.days) {
        if (
          typeof day.date !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || Number.isNaN(Date.parse(day.date))
        )
          throw error('记录日期无效。');
      }
      for (const el of spread.elements) {
        if (
          !['text', 'asset', 'photo', 'doodle'].includes(el.kind) ||
          !Number.isFinite(el.x) ||
          !Number.isFinite(el.y) ||
          !Number.isFinite(el.w) ||
          el.w < 1 ||
          el.w > 100 ||
          typeof el.id !== 'string'
        )
          throw error('页面元素格式不正确。');
        if (el.src && !/^\/(materials|uploads)\/[a-zA-Z0-9._-]+$/.test(el.src))
          throw error('图片路径不正确。');
      }
    };
    if(book.collageTemplates!==undefined){
      if(!Array.isArray(book.collageTemplates)||book.collageTemplates.length>40)throw error('组合数量不正确。');
      for(const t of book.collageTemplates){
        if(typeof t.id!=='string'||typeof t.name!=='string'||t.name.length>40||!Number.isFinite(t.ratio)||t.ratio<.6||t.ratio>2.5)throw error('组合格式不正确。');
        checkSpread({days:[],elements:t.elements});
      }
    }
    for (const spread of book.spreads) checkSpread(spread);
    if (book.flyleaf !== undefined) checkSpread(book.flyleaf);
  }
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};
async function serve(res, path, base) {
  const absolute = resolve(base, '.' + path);
  if (absolute !== resolve(base) && !absolute.startsWith(resolve(base) + sep))
    throw error('路径无效。', 403);
  let file = absolute;
  try {
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
  } catch {
    if (!extname(path)) file = resolve(base, 'index.html');
    else throw error('文件不存在。', 404);
  }
  try {
    const buffer = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    res.end(buffer);
  } catch {
    throw error('尚未构建页面，请先运行启动手帐。', 404);
  }
}
async function designRequest(messages, attempt, diagnostic, signal) {
      let response;
      try {
        response=await fetch(normalizeBaseUrl(settings.baseUrl)+'/chat/completions',{
          method:'POST',headers:{Authorization:`Bearer ${settings.apiKey}`,'Content-Type':'application/json'},
          body:JSON.stringify({model:settings.model,messages,...designOptions(settings.baseUrl,attempt)}),
          signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000),
        });
      } catch {throw Object.assign(Error('AI 连接失败或超时，请稍后重试。'),{code:'connection'});}
      diagnostic.httpStatus=response.status;
      if(!response.ok) {
        const body=await response.text();
        const imageUnsupported=response.status===400 && /does not support image|image.*not supported/i.test(body);
        throw Object.assign(Error(imageUnsupported?'当前模型不支持图片，请改选视觉模型或关闭“让 AI 理解照片”。':providerError(response.status)),{code:'provider'});
      }
      const result=await response.json();
      const choice=result.choices?.[0];
      Object.assign(diagnostic,{finishReason:choice?.finish_reason,contentLength:choice?.message?.content?.length||0,reasoningLength:choice?.message?.reasoning_content?.length||0,usage:result.usage});
      return parseDesign(result);
}
async function generate(input) {
  if (configIssue(settings)) throw error(configIssue(settings), 409);
  if (!Array.isArray(input.days) || (!input.days.length && !input.elements?.length && !String(input.instruction || '').trim()) || input.days.length > 100)
    throw error('需要提供当天的记录。');
  for (const d of input.days)
    if (typeof d.raw !== 'string' || d.raw.length > 8000)
      throw error('每天的记录请控制在 8000 字以内。');
  const libraryAssets = await withMaterialColors(await library());
  // A full redesign starts from content, not yesterday's decoration pile.
  input={...input,doodleMode:'handdrawn',elements:(input.elements||[]).map(p=>p.groupId?{...p,locked:true}:p).filter(p=>p.locked || p.kind==='photo' || p.kind==='text'&&!isEmptyTextHint(p))};
  const terms=(input.elements.filter(p=>p.kind==='text').map(p=>p.text).join(' ')+' '+input.days.map(d=>d.text||d.raw).join(' ')+' '+String(input.instruction||'')).toLowerCase();
  let candidateAssets=selectStickers(libraryAssets,terms);
  const assets=libraryAssets;
  const allowedThemes = ['herbarium', 'postcard', 'rose', 'archive'];
  let editorial={edited:false,requirements:{}};
  if(String(input.instruction||'').trim() && input.elements?.some(p=>p.kind==='text'&&!p.locked)) {
    const messages=[{role:'system',content:editorialPrompt},{role:'user',content:JSON.stringify({instruction:input.instruction,requiredSourceIds:requiredEditorialSources(input).map(p=>p.id),elements:input.elements.filter(p=>p.kind==='text').map(p=>({id:p.id,text:p.text,role:p.role,locked:p.locked}))})}];
    const attempts=[];
    for(let attempt=0;attempt<2;attempt++) {
      const diagnostic={at:new Date().toISOString(),stage:'editorial',attempt:attempt+1,model:settings.model};
      const started=Date.now();
      try {
        editorial=prepareEditorial(input,await designRequest(messages,attempt,diagnostic));
        input=editorial.input;
        diagnostic.ok=true;
        break;
      } catch(cause) {
        const e=['AbortError','TimeoutError'].includes(cause.name)?Object.assign(Error('AI 文字整理超时，请稍后重试。'),{code:'connection'}):cause;
        Object.assign(diagnostic,{ok:false,errorCode:e.code||'editorial_validation',error:e.message});
        if(attempt||['provider','connection','refused'].includes(e.code)) throw error(`${e.message} 原有手帐未改动。`,502);
        messages.push({role:'user',content:`文字整理未通过检查：${e.message} ${e.retryHint||''} 请重新按要求返回完整JSON。`});
      } finally {
        diagnostic.durationMs=Date.now()-started;attempts.push({...diagnostic});
        await atomic('ai-last-editorial.json',{...diagnostic,attempts}).catch(()=>{});
      }
    }
  }
  let designBrief;
  const artMessages=[{role:'system',content:artPrompt},{role:'user',content:JSON.stringify({instruction:input.instruction,texts:input.elements.filter(p=>p.kind==='text').map(p=>p.text),days:input.elements.length?[]:input.days.map(d=>d.text||d.raw)})}];
  for(let attempt=0;attempt<2;attempt++) {
    try { designBrief=await designRequest(artMessages,attempt,{});break; }
    catch { if(attempt) throw error('AI 未完成视觉方案，请重试。原有手帐未改动。',502);artMessages.push({role:'user',content:'请返回完整且精简的JSON视觉方案。'}); }
  }
  candidateAssets=selectStickers(libraryAssets,terms,Array.isArray(designBrief.palette)?designBrief.palette:[]);
  candidateAssets=[...candidateAssets,...libraryAssets.filter(a=>a.id.startsWith('collage-arrow')&&!candidateAssets.some(b=>b.id===a.id))];
  const system = layoutPrompt(candidateAssets);
  const userText = JSON.stringify({
    days: input.days.map((d) => ({
      date: d.date,
      raw: d.raw,
      title: d.title,
      text: d.text,
      photoCount: d.photos?.length || 0,
    })),
    designBrief,
    paper:input.paper,
    editorialEdited:editorial.edited,
    requirements:editorial.requirements,
    elements: (input.elements||[]).map(p=>p.locked?p:{id:p.id,kind:p.kind,role:p.role,text:p.text,dayId:p.dayId,paragraphIndex:p.paragraphIndex,stickerKeywords:p.stickerKeywords,src:p.src,w:p.w,h:p.h,frame:p.frame,groupId:p.groupId,attachedTo:p.attachedTo,fontFamily:p.fontFamily,lineHeight:p.lineHeight}),
    instruction: String(input.instruction || '').slice(0, 1000),
  });
  let content = userText;
  if (settings.vision) {
    content = [{ type: 'text', text: userText }];
    for (let i = 0; i < input.days.length; i++) {
      for (const photo of (input.days[i].photos || []).slice(0, 6)) {
        if (!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(photo)) continue;
        const buffer = await readFile(resolve(data, photo.slice(1)));
        content.push(
          { type: 'text', text: `第${i + 1}天的照片：` },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mime[extname(photo)]};base64,${buffer.toString('base64')}`,
              detail: 'low',
            },
          },
        );
      }
    }
  }
  const messages = [{role:'system',content:system},{role:'user',content}];
  let output, elements;
  const attempts=[];
  for (let attempt=0; attempt<2; attempt++) {
    const started=Date.now();
    const diagnostic={at:new Date().toISOString(),model:settings.model,attempt:attempt+1,imageCount:Array.isArray(content)?content.filter(p=>p.type==='image_url').length:0};
    try {
      output=await designRequest(messages,attempt,diagnostic);
      // Never let paragraph grouping or an omitted metadata array create/drop journal records.
      output.days=designRecords(input,output);
      if(output.days.some(d=>typeof d.text!=='string'||typeof d.title!=='string')) throw Error('AI 返回的日志不完整。');
      elements=validatePlan(output.elements,input,assets);
      elements=finishCollage(elements,input,[...candidateAssets,...assets.filter(a=>!candidateAssets.some(b=>b.id===a.id))],designBrief);
      if(editorial.requirements.framed) elements=elements.map(p=>p.kind==='text' && (Number.isInteger(p.paragraphIndex)||p.role==='body') && !['outline','note','torn','ticket','postcard','vellum','label','collage'].includes(p.frame) ? {...p,frame:'outline'} : p);
      const locked=input.elements.filter(p=>p.locked);
      const protectedIds=new Set(locked.map(p=>p.id));
      const ratio=Number.isFinite(input.ratio)?Math.max(.6,Math.min(2.5,input.ratio)):1.43;
      const safety=tidyLayout([...elements.filter(p=>!protectedIds.has(p.sourceId)).map((p,i)=>({...p,id:p.sourceId||`layout-${i}`})),...locked],ratio,3);
      const failures=safety.issues.filter(issue=>issue.ids.some(id=>!protectedIds.has(id)));
      if(failures.length)throw Object.assign(Error('版式存在文字遮挡或空间不足，请减少装饰或增加跨页。'),{retryHint:JSON.stringify(failures.slice(0,8))});
      elements=safety.elements.filter(p=>!protectedIds.has(p.id)).map(({id:_id,locked:_locked,...p})=>p);
      diagnostic.textBoxes=elements.filter(p=>p.kind==='text').map(p=>({role:p.role,x:p.x,y:p.y,w:p.w,h:p.h,fontSize:p.fontSize,length:p.text?.length,frame:p.frame}));
      checkParagraphDesign(elements,input,editorial.requirements,assets);
      diagnostic.ok=true;
      break;
    } catch(cause) {
      const e=['AbortError','TimeoutError'].includes(cause.name) ? Object.assign(Error('AI 响应读取超时，尚未收到完整设计，请稍后重试。'),{code:'connection'}) : cause;
      diagnostic.ok=false;
      diagnostic.errorCode=e.code||'layout_validation';
      diagnostic.error=e.message;
      if(attempt || ['provider','connection','refused'].includes(e.code)) throw error(`${e.message} 原有手帐未改动。`,502);
      messages.push({role:'user',content:`上次返回没有通过检查：${e.message} ${e.retryHint||''} 请重新输出完整、精简、有效的JSON对象。所有原有文字和照片通过sourceId引用，不重复原文；不要遗漏引用。不要解释，不要代码围栏。`});
    } finally {
      diagnostic.durationMs=Date.now()-started;
      attempts.push({...diagnostic});
      await atomic('ai-last-result.json',{...diagnostic,attempts}).catch(()=>{});
    }
  }
  return {
    designConcept:typeof designBrief.concept==='string'?designBrief.concept.slice(0,100):undefined,
    contentEdited:editorial.edited,
    elements,
    theme: allowedThemes.includes(output.theme) ? output.theme : 'herbarium',
    layout: ['airy', 'collage', 'letter'].includes(output.layout)
      ? output.layout
      : 'collage',
    days: output.days.map((d) => {
      if (typeof d.text !== 'string' || typeof d.title !== 'string')
        throw error('AI 返回的日志不完整。', 502);
      return {
        title: d.title.slice(0, 30),
        text: d.text.slice(0, 8000),
        assetIds: (Array.isArray(d.assetIds) ? d.assetIds : [])
          .filter((id) => assets.some((a) => a.id === id))
          .slice(0, 3),
      };
    }),
  };
}
const catalogService=await createMaterialCatalog({readJSON,atomic,readAssets:rawLibrary,getSettings:publicSettings,requestAI:designRequest,root,data});
let pendingMaterialReopen=null;
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    const allowedHosts = new Set([
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      `127.0.0.1:${webPort}`,
      `localhost:${webPort}`,
    ]);
    if (!allowedHosts.has(host))
      throw error('不接受此主机的请求。', 403);
    const allowedOrigins = new Set([
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      `http://127.0.0.1:${webPort}`,
      `http://localhost:${webPort}`,
    ]);
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
      throw error('仅允许本机手帐页面访问。', 403);
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path === '/api/health') return json(res, { ok: true, runtimeId: 'page-elements-v0.1.20' });
    if (path === '/api/capabilities' && req.method === 'GET') return json(res, { platform: platform(), ...nativeCapabilities });
    if (path === '/api/fonts' && req.method === 'GET') return json(res,{fonts:userFonts.map(fontPublic)});
    if (path === '/api/fonts.css' && req.method === 'GET') {
      const css=userFonts.map(font=>`@font-face{font-family:'Journal User ${font.id}';src:url('/api/fonts/file/${font.id}');font-weight:400;font-style:normal;font-display:swap;}`).join('\n');
      res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(css);return;
    }
    const fontFileMatch=/^\/api\/fonts\/file\/([a-f0-9]{24})$/.exec(path);
    if(fontFileMatch&&req.method==='GET'){
      const font=userFonts.find(item=>item.id===fontFileMatch[1]);if(!font)throw error('字体不存在。',404);
      const bytes=await readFile(resolve(userFontsDir,font.id+font.ext));
      res.writeHead(200,{'Content-Type':FONT_MIME[font.ext]||'application/octet-stream','Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});res.end(bytes);return;
    }
    if(path==='/api/fonts/import'&&req.method==='POST'){
      const filename=String(url.searchParams.get('filename')||'').trim();
      if(!filename)throw error('缺少字体文件名。');
      const buffer=await rawBody(req);
      const imported=[];
      if(extname(filename).toLowerCase()==='.zip'){
        const entries=zipFontEntries(buffer);if(!entries.length)throw error('ZIP 中没有找到 TTF、OTF、WOFF 或 WOFF2 字体。');
        for(const entry of entries)imported.push(await persistFont(entry.data,entry.name));
      }else imported.push(await persistFont(buffer,filename));
      return json(res,{fonts:[...new Map(imported.map(font=>[font.id,fontPublic(font)])).values()]});
    }
    if (path === '/api/history' && req.method === 'GET') return json(res, await journalHistory.list());
    if (path.startsWith('/api/history/') && req.method === 'GET') return json(res, await journalHistory.read(path.slice('/api/history/'.length)));
    if (path === '/api/state' && req.method === 'GET') return json(res, state);
    if (path === '/api/state' && req.method === 'PUT') {
      const next = await body(req);
      validateState(next);
      const task = writeQueue.then(async () => {
        if (next.revision !== state.revision)
          throw error(
            '其他窗口更新了手帐。请先导出当前记录，再刷新页面。',
            409,
          );
        let historyWarning;
        try { await journalHistory.captureBeforeSave(state, next); }
        catch { historyWarning = '本次手帐已保存，但历史备份未能完成。请检查磁盘空间或数据目录权限，并导出备份。'; }
        try {
          await copyFile(
            resolve(data, 'journal.json'),
            resolve(data, 'journal.previous.json'),
          );
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
        const saved = { books: next.books, revision: state.revision + 1 };
        await atomic('journal.json', saved);
        state = saved;
        return { revision: saved.revision, ...(historyWarning ? { historyWarning } : {}) };
      });
      writeQueue = task.catch(() => {});
      return json(res, await task);
    }
    if (path === '/api/validate' && req.method === 'POST') {
      const candidate = await body(req);
      validateState(candidate);
      return json(res, { valid: true });
    }
    if (path === '/api/settings' && req.method === 'GET')
      return json(res, publicSettings());
    if (path === '/api/settings' && req.method === 'PUT') {
      const next = await body(req);
      let baseUrl;
      try {
        baseUrl = normalizeBaseUrl(next.baseUrl || 'https://api.deepseek.com');
      } catch (e) {
        throw error(e.message || '请填写完整的 API 地址。');
      }
      if (typeof next.model !== 'string' || next.model.length > 100)
        throw error('模型名称无效。');
      let updated = {
        baseUrl,
        model: (next.model || DEEPSEEK_DEFAULT_MODEL).trim(),
        vision: next.vision !== false,
        apiKey: next.clearKey
          ? ''
          : typeof next.apiKey === 'string' && next.apiKey.trim()
            ? next.apiKey.trim()
            : settings.apiKey,
      };
      updated = migrateLegacyConfig(updated).config;
      const issue = configIssue(updated);
      if (issue) throw error(issue);
      await atomicAt(configData, 'settings.json', updated);
      const persisted = await readConfigJSON('settings.json', null);
      if (!persisted || persisted.baseUrl !== updated.baseUrl || persisted.model !== updated.model || persisted.apiKey !== updated.apiKey || persisted.vision !== updated.vision)
        throw error('AI 设置写入后校验失败，请检查本机配置目录权限。', 500);
      settings = updated;
      return json(res, publicSettings());
    }
    if (path === '/api/settings/test' && req.method === 'POST') {
      if (configIssue(settings)) throw error(configIssue(settings), 409);
      const baseUrl = normalizeBaseUrl(settings.baseUrl);
      const headers = { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' };
      const stages = [];
      async function call(messages, extra = {}) {
        let response;
        try {
          response = await fetch(baseUrl + '/chat/completions', {
            method: 'POST', headers,
            body: JSON.stringify({ model: settings.model, messages, max_tokens: 96, ...extra }),
            signal: AbortSignal.timeout(30000),
          });
        } catch { throw error('连接超时或网络不可用，请稍后重试。', 502); }
        if (!response.ok) throw error(providerError(response.status), 502);
        let result; try { result = await response.json(); } catch { throw error('接口返回的不是有效 AI 响应。', 502); }
        const content = result.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw error('接口响应格式不兼容。', 502);
        return content;
      }
      const text = await call([{ role: 'user', content: 'Reply with OK only.' }]);
      if(!/ok/i.test(text)) throw error('AI 能连接，但基础文字测试未返回预期结果。',502);
      stages.push({ key: 'text', ok: true, label: '文字调用' });
      const jsonText = await call([{ role: 'user', content: 'Return only this JSON object: {"ok":true}' }]);
      let parsed = null; try { parsed = JSON.parse(jsonText.replace(/^```json\s*|\s*```$/g, '')); } catch {}
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw error('模型可调用，但手帐需要的 JSON 返回测试失败。', 502);
      stages.push({ key: 'json', ok: true, label: 'JSON 返回' });
      if (settings.vision) {
        const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        await call([{ role: 'user', content: [{ type: 'text', text: 'Describe this image in one short word.' }, { type: 'image_url', image_url: { url: pixel } }] }]);
        stages.push({ key: 'vision', ok: true, label: '图片理解' });
      }
      return json(res, { ok: true, message: `AI 测试通过：${stages.map(s=>s.label).join('、')}。`, stages, testedAt: new Date().toISOString() });
    }
    if (path === '/api/materials/reopen' && req.method === 'GET') {
      const item=pendingMaterialReopen;
      pendingMaterialReopen=null;
      return json(res,{item});
    }
    if (path === '/api/materials/reopen' && req.method === 'POST') {
      const input=await body(req);
      const id=String(input.id||'');
      const assets=await rawLibrary();
      const asset=assets.find(item=>item.id===id);
      if(!asset)throw error('素材不存在。',404);
      if(!(asset.sourceImage||String(asset.sourceUrl||'').startsWith('/uploads/')))throw error('仅支持重新编辑已导入素材。',400);
      pendingMaterialReopen={id:asset.id,src:asset.src,name:asset.name};
      return json(res,{ok:true});
    }
    if (path === '/api/materials/remove' && req.method === 'POST') {
      const input = await body(req);
      const id = String(input.id || '');
      const asset = customAssets.find((item) => item.id === id);
      if (!asset) throw error('这个素材不是可删除的用户素材。', 404);
      const used = JSON.stringify(state).includes(`"assetId":"${id}"`) || JSON.stringify(state).includes(`"${id}"`);
      if (used) throw error('这个素材已经放入手帐页面，请先从手帐中移除后再删除。', 409);
      customAssets = customAssets.filter((item) => item.id !== id);
      await atomic('materials.json', customAssets);
      return json(res, { ok: true, assets: await library() });
    }
    if(catalogService.handles(path)) return json(res,await catalogService.handle(path,req.method,req.method==='GET'?undefined:await body(req)));
    if (path === '/api/materials' && req.method === 'GET')
      return json(res, await library());
    if (path === '/api/materials/jobs' && req.method === 'GET')
      return json(res, consolidatedJobs(materialJobs));
    if (path === '/api/materials/pinterest/resolve' && req.method === 'POST') {
      const input = await body(req);
      const parsed = parsePinterestInput(input.input);
      const metadata = await resolvePinterestPin(parsed.pinId);
      return json(res, {
        pinId: parsed.pinId,
        originalUrl: parsed.originalUrl,
        previewUrl: metadata.previewUrl || metadata.candidates[0],
        images: (metadata.images || []).map(({ id, previewUrl, downloadUrl }) => ({ id, previewUrl, downloadUrl })),
      });
    }
    if (path === '/api/materials/pinterest/import' && req.method === 'POST') {
      const input = await body(req);
      const parsed = parsePinterestInput(input.input);
      const resolved = await downloadPinterestImage(parsed.pinId, input.imageUrl || '');
      const sha256 = createHash('sha256').update(resolved.buffer).digest('hex');
      let existing = pinterestImports.find((item) => item.pinId === parsed.pinId || item.sha256 === sha256);
      if (existing) {
        try { await stat(resolve(data, existing.src.slice(1))); }
        catch { pinterestImports = pinterestImports.filter((item) => item !== existing); existing = null; await atomic('pinterest-imports.json', pinterestImports); }
      }
      if (existing) {
        return json(res, {
          src: existing.src,
          name: existing.name || `Pinterest ${parsed.pinId}`,
          duplicate: true,
          pinId: existing.pinId,
          originalUrl: existing.originalUrl,
          imageUrl: existing.imageUrl,
          sha256: existing.sha256,
          autoSegment: nativeCapabilities.segment,
          platform: platform(),
        });
      }
      const name = randomUUID() + '.' + resolved.ext;
      const src = '/uploads/' + name;
      const target = resolve(data, 'uploads', name);
      let wrote = false;
      try {
        await writeFile(target, resolved.buffer, { mode: 0o600 });
        wrote = true;
        const record = {
          pinId: parsed.pinId,
          src,
          name: `Pinterest ${parsed.pinId}`,
          originalUrl: parsed.originalUrl,
          imageUrl: resolved.imageUrl,
          sha256,
          createdAt: new Date().toISOString(),
        };
        pinterestImports = [record, ...pinterestImports.filter((item) => item.pinId !== parsed.pinId && item.sha256 !== sha256)].slice(0, 2000);
        await atomic('pinterest-imports.json', pinterestImports);
        return json(res, { ...record, duplicate: false, autoSegment: nativeCapabilities.segment, platform: platform() });
      } catch (e) {
        if (wrote) try { await unlink(target); } catch {}
        throw e;
      }
    }
    if (path === '/api/materials/source' && req.method === 'POST') {
      const input = await body(req);
      if (!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(input.src || '')) throw error('请选择本机已保存的素材原图。');
      try { await stat(resolve(data, input.src.slice(1))); } catch { throw error('找不到原图，请重新导入。', 404); }
      const previous = consolidatedJobs(materialJobs).find((j) => j.source === input.src);
      if (previous) return json(res, previous);
      const pinRecord = pinterestBySrc(input.src);
      const job = {
        id: randomUUID(), source: input.src, name: String(input.name || '导入素材').slice(0, 80), createdAt: new Date().toISOString(),
        engine: pinRecord ? 'Pinterest 原图 · 手动裁切' : '原图 · 手动裁切', mode: 'manual', manualOnly: true,
        sourceMeta: pinterestSourceMeta(pinRecord), items: [],
      };
      await materialWrite(async () => { materialJobs = [job, ...materialJobs.filter((j) => j.source !== input.src)]; await atomic('material-jobs.json', materialJobs); });
      return json(res, job);
    }
    if (path === '/api/materials/add-item' && req.method === 'POST') {
      const input = await body(req);
      if (!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(input.src || '')) throw error('裁切图片无效。');
      const width = Number(input.width), height = Number(input.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 20000 || height > 20000) throw error('裁切尺寸无效。');
      try { await stat(resolve(data, input.src.slice(1))); } catch { throw error('找不到裁切图片。', 404); }
      const job = materialJobs.find((j) => j.id === input.jobId);
      if (!job) throw error('未找到这条素材处理记录。', 404);
      const item = { id: randomUUID(), src: input.src, name: String(input.name || `素材 ${String(job.items.length + 1).padStart(2, '0')}`).slice(0,80), width: Math.round(width), height: Math.round(height), manual: true, imported: false };
      await materialWrite(async () => { job.items.push(item); await atomic('material-jobs.json', materialJobs); });
      return json(res, job);
    }
    if (path === '/api/materials/segment' && req.method === 'POST') {
      const input = await body(req);
      if (!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(input.src || ''))
        throw error('请先导入素材图片。');
      try {await stat(resolve(data,input.src.slice(1)))}catch{throw error('找不到原图，请重新导入。',404)}
      const requestedMode = ['auto', 'ai', 'paper', 'dense', 'panels', 'single', 'crop'].includes(input.mode)
        ? input.mode
        : 'auto';
      const tolerance = Number(input.tolerance ?? 28);
      if (!Number.isFinite(tolerance) || tolerance < 5 || tolerance > 100)
        throw error('去底强度无效。');
      const previous = consolidatedJobs(materialJobs).find((j) => j.source === input.src);
      const continuing = input.continue === true && !input.rect;
      const strategy = nextMaterialStrategy({ requestedMode, tolerance, previous, continuing });
      const attempt = strategy.attempt;
      const mode = strategy.mode;
      const effectiveTolerance = strategy.tolerance;
      const rect = input.rect;
      if (
        rect &&
        (!Array.isArray(rect) ||
          rect.length !== 4 ||
          rect.some((n) => !Number.isFinite(n) || n < 0 || n > 1) ||
          rect[2] < 0.01 ||
          rect[3] < 0.01 ||
          rect[0] + rect[2] > 1.001 ||
          rect[1] + rect[3] > 1.001)
      )
        throw error('框选范围无效。');
      if (['single','crop'].includes(mode) && !rect) throw error('请先框选单个素材。');
      if (!nativeCapabilities.segment) throw error('当前系统暂不支持本机自动拆图；Mac 版可使用自动拆图，Windows 版请先使用普通图片素材与自由裁切。', 501);
      let result;
      try {
        const output = await run(
          resolve(root, 'local/segment'),
          [
            resolve(data, input.src.slice(1)),
            resolve(data, 'uploads'),
            mode,
            String(effectiveTolerance),
            ...(rect ? rect.map(String) : []),
          ],
          { timeout: 120000, maxBuffer: 1024 * 1024 },
        );
        result = JSON.parse(output.stdout);
      } catch {
        result = { items: [], engine: '识别未完成，请框选或切换模式' };
      }
      if(!result.items?.length)throw error('未拆出素材，请切换模式或框选；原有结果已保留。',422);
      let job = {
        id: randomUUID(),
        source: input.src,
        name: String(input.name || '导入素材').slice(0, 80),
        createdAt: new Date().toISOString(),
        mode: requestedMode,
        strategy: mode,
        attempt,
        tolerance,
        effectiveTolerance,
        engine: result.engine,
        sourceMeta: pinterestSourceMeta(pinterestBySrc(input.src)),
        rect: rect || null,
        items: result.items.map((item, index) => ({
          id: randomUUID(),
          src: '/uploads/' + item.file,
          name: `素材 ${String(index + 1).padStart(2, '0')}`,
          width: item.width,
          height: item.height,
          bounds: item.bounds,
          manual:!!rect,
          imported: false,
        })),
      };
      await materialWrite(async () => {
        // Recognition can take seconds. Preserve edits made while it was running
        // using the latest record inside the same serialized write as imports.
        const current = consolidatedJobs(materialJobs).find(j=>j.source===input.src);
        if(previous&&!current)throw error('这条处理记录已删除，请重新导入原图。',409);
        if(current){job={...job,id:current.id,createdAt:current.createdAt,rect:null,items:rect?[...current.items,...job.items]:[...current.items.filter(i=>i.imported||i.manual),...job.items]};}
        materialJobs = [job, ...materialJobs.filter(j=>j.source!==input.src)];
        await atomic('material-jobs.json', materialJobs);
      });
      return json(res, job);
    }
    if (path === '/api/materials/delete' && req.method === 'POST') {
      const input = await body(req);
      const result = await materialWrite(async () => {
        const job = materialJobs.find((j) => j.id === input.jobId);
        if (!job) throw error('未找到这条素材处理记录。', 404);
        materialJobs = materialJobs.filter((j) => j.id !== job.id);
        await atomic('material-jobs.json', materialJobs);
        return { ok: true, imported: job.items.filter((i) => i.imported).length };
      });
      return json(res, result);
    }
    if (path === '/api/materials/import' && req.method === 'POST') {
      const input = await body(req);
      if (
        !Array.isArray(input.itemIds) ||
        !input.itemIds.length ||
        input.itemIds.length > 100
      )
        throw error('请选择要加入素材库的结果。');
      const result = await materialWrite(async () => {
        const job = materialJobs.find((j) => j.id === input.jobId);
        if (!job) throw error('未找到这次分离结果。');
        if (
          input.itemIds.some((id) => !job.items.some((item) => item.id === id))
        )
          throw error('包含无效素材。');
        const selected = job.items.filter((i) => input.itemIds.includes(i.id));
        const added = selected
          .filter((i) => !customAssets.some((a) => a.id === i.id))
          .map((item, index) => ({
            id: item.id,
            name:
              String(input.names?.[item.id] || item.name)
                .trim()
                .slice(0, 80) || `素材 ${index + 1}`,
            category:
              String(input.category || '我的素材')
                .trim()
                .slice(0, 30) || '我的素材',
            tags: [
              '用户导入',
              ...String(input.tags || '')
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
            ].slice(0, 15),
            src: item.src,
            sourceUrl: job.sourceMeta?.originalUrl || job.source,
            sourceImage: job.source,
            ...(job.sourceMeta ? { source: job.sourceMeta } : {}),
            license: '用户导入',
            author: '我的素材',
            width: item.width,
            height: item.height,
          }));
        customAssets = [...customAssets, ...added];
        await atomic('materials.json', customAssets);
        for (const item of selected) item.imported = true;
        await atomic('material-jobs.json', materialJobs);
        return { added: added.length, assets: await library(), job };
      });
      return json(res, result);
    }
    if (path === '/api/upload' && req.method === 'POST') {
      const input = await body(req);
      const match =
        /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(
          input.data || '',
        );
      if (!match) throw error('请选择 JPG、PNG 或 WebP 图片。');
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 10 * 1024 * 1024)
        throw error('单张图片不能超过 10 MB。');
      const valid =
        match[1] === 'jpeg'
          ? buffer[0] === 255 && buffer[1] === 216
          : match[1] === 'png'
            ? buffer
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : buffer.toString('ascii', 0, 4) === 'RIFF' &&
              buffer.toString('ascii', 8, 12) === 'WEBP';
      if (!valid) throw error('图片内容与格式不匹配。');
      const name =
        randomUUID() + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]);
      await writeFile(resolve(data, 'uploads', name), buffer, { mode: 0o600 });
      return json(res, { src: '/uploads/' + name });
    }
    if (path === '/api/cutout' && req.method === 'POST') {
      const input = await body(req);
      if (!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(input.src || ''))
        throw error('请选择本机上传的照片。');
      if (!nativeCapabilities.cutout) throw error('当前系统暂不支持本机主体抠图；原图不会被修改，可继续使用自由裁切。', 501);
      const name = randomUUID() + '.png';
      try {
        await run(
          resolve(root, 'local/cutout'),
          [resolve(data, input.src.slice(1)), resolve(data, 'uploads', name)],
          { timeout: 90000 },
        );
        return json(res, { src: '/uploads/' + name });
      } catch {
        throw error(
          '这张照片暂时无法自动抠出主体。原图已保留，可尝试其他照片或使用裁切。',
          422,
        );
      }
    }
    if (path === '/api/generate' && req.method === 'POST')
      return json(res, await generate(await body(req)));
    if (path.startsWith('/api/')) throw error('接口不存在。', 404);
    if (!['GET', 'HEAD'].includes(req.method))
      throw error('不支持此操作。', 405);
    if (path.startsWith('/uploads/')) {
      if (!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path))
        throw error('图片不存在。', 404);
      return await serve(res, path, data);
    }
    if (path.startsWith('/materials/'))
      return await serve(res, path, resolve(root, 'public'));
    if (/^\/(?:fonts|textures)\//.test(path) || path === '/favicon.svg')
      return await serve(res, path, resolve(root, 'public'));
    return await serve(res, path, resolve(root, 'dist/client'));
  } catch (e) {
    if (!res.headersSent)
      json(
        res,
        {
          error: e.status
            ? e.message
            : '保存或读取失败，请检查本机文件权限和可用空间。',
        },
        e.status || 500,
      );
    else res.end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`拾光本地服务 http://127.0.0.1:${port}`),
);
