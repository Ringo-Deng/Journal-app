const rgb=v=>/^#[a-f0-9]{6}$/i.test(v||'')?[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)):null;
export function selectStickers(assets, text='', palette=[], limit=48) {
 const terms=text.toLowerCase();const colors=palette.map(rgb).filter(Boolean);
 const scored=assets.map((a,index)=>{
  const tags=[a.name,...a.tags||[],...a.styles||[],...a.functions||[]];
  const semantic=[...new Set(tags)].filter(t=>typeof t==='string'&&t.length>1&&terms.includes(t.toLowerCase())).length;
  const distance=Math.min(442,...(a.colors||[]).flatMap(c=>{const col=rgb(c);return col?colors.map(p=>Math.hypot(...p.map((v,i)=>v-col[i]))):[]}));
  return {a,index,score:semantic*3+(colors.length?Math.max(0,1-distance/220)*4:0)};
 }).sort((a,b)=>b.score-a.score||a.index-b.index);
 // Reserve half the choices for a varied palette of categories, even with no keyword overlap.
 const picked=scored.filter(x=>x.score>0).slice(0,Math.floor(limit/2)).map(x=>x.a);
 const groups=new Map();for(const {a} of scored){if(picked.includes(a))continue;const key=a.category||'其他';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
 while(picked.length<limit && [...groups.values()].some(g=>g.length))for(const group of groups.values()){if(group.length&&picked.length<limit)picked.push(group.shift());}
 return picked;
}
