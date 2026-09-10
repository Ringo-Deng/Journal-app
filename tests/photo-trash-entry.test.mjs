import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('photo trash is opened from the lower-left settings instead of the editor toolbar',async()=>{
 const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 const toolbar=source.slice(source.indexOf('<header className="compact-bar editor-header">'),source.indexOf('</header>}'));
 const settings=source.slice(source.indexOf("open={modal === 'settings'}"),source.indexOf('{imageExportOpen'));
 assert.doesNotMatch(toolbar,/照片回收站/);
 assert.match(source,/<button aria-label="设置" onClick={openSettings}><Settings\/><span>设置<\/span><\/button>/);
 assert.match(settings,/<DialogTitle>设置<\/DialogTitle>/);
 assert.match(settings,/管理 AI 连接与保留在本机的照片原图。/);
 assert.match(settings,/className="lock-card settings-photo-trash"/);
 assert.match(settings,/照片回收站<small>查看、恢复或清理照片蒙版保留的原图。<\/small>/);
 assert.ok(settings.indexOf('className="lock-card settings-photo-trash"')<settings.indexOf('className="settings-section-title"'));
 assert.match(settings,/onClick=\{\(\)=>\{setModal\(null\);cancelPhotoMask\(\);setPhotoTrashOpen\(true\);\}\}>打开<\/button>/);
 assert.equal([...source.matchAll(/>照片回收站</g)].length,1);
});
