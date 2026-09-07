'use client';
import type {PaperFeel,CollageTemplate} from '@/lib/journal';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

export default function CollageStudio({open,onClose,feel,color,onFeel,onColor,onCream,onCheck,onTidy,templates,onInsert}:{open:boolean;onClose:()=>void;feel?:PaperFeel;color:string;onFeel:(f:PaperFeel)=>void;onColor:(c:string)=>void;onCream:()=>void;onCheck:()=>void;onTidy:()=>void;templates:CollageTemplate[];onInsert:(t:CollageTemplate)=>void}) {
 const f=feel||{texture:0,spine:0,edge:0};
 return <Dialog open={open} onOpenChange={v=>!v&&onClose()}><DialogContent className="journal-dialog collage-studio">
  <DialogTitle>旅行拼贴</DialogTitle><DialogDescription>设置当前跨页的纸感，组合照片与文字。每次调整都可以撤销。</DialogDescription>
  <button aria-label="应用奶油纸旅行风格" className="cream-style-card" onClick={onCream}><span className="cream-sample"><b>去有风的地方</b><i>Days to remember</i><span className="sample-photo"/></span><span><strong>奶油纸 · 旅行手记</strong><small>毛笔标题、细笔正文、柔和照片白边</small><em>应用到当前跨页</em></span></button>
  <div className="paper-feel-controls"><label>纸张颜色<input type="color" aria-label="拼贴纸张颜色" value={color} onChange={e=>onColor(e.target.value)}/></label>{([['texture','纸纹'],['spine','书脊阴影'],['edge','页边质感']] as const).map(([key,label])=><label key={key}>{label}<input type="range" aria-label={label} min={0} max={100} value={Math.round((feel?.[key]??0)*100)} onChange={e=>onFeel({...f,[key]:Number(e.target.value)/100})}/></label>)}</div>
  <div className="collage-layout-actions"><button className="outline" onClick={onCheck}>检查遮挡与越界</button><button className="outline" onClick={onTidy}>整理位置并预览</button></div>
  <p className="microcopy">整理位置会保留文字、照片、字号和组合关系；空间不足时提示增加跨页。</p>
  <h3>我的组合</h3><p className="microcopy">按住 Shift 点击多个元素，再选择“编为一组”和“保存组合”。</p>
  <div className="collage-template-list">{templates.length?templates.map(t=><button key={t.id} className="outline" onClick={()=>onInsert(t)}>{t.name}<small>{t.elements.length} 个元素 · 点击插入</small></button>):<p>还没有保存的组合。</p>}</div>
  <button className="primary" onClick={onClose}>回到纸面</button>
 </DialogContent></Dialog>;
}
