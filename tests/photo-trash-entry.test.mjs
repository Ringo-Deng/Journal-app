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
 assert.match(settings,/AI 创作与本机照片管理/);
 assert.match(settings,/<button className="app-settings-trash" onClick=\{\(\)=>\{setModal\(null\);cancelPhotoMask\(\);setPhotoTrashOpen\(true\);\}\}>/);
 assert.match(settings,/<strong>照片回收站<\/strong><small>恢复或清理照片蒙版保留的原图<\/small>/);
 assert.ok(settings.indexOf('className="app-settings-trash"')>settings.indexOf('className="app-settings-actions"'));
 assert.equal([...source.matchAll(/>照片回收站</g)].length,1);
});
