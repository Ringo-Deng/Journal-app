export const paperShapes = Object.freeze({rect:'直边纸',torn:'手撕纸',ticket:'缺口票券',oval:'椭圆便签'});
export const paperPatterns = Object.freeze({plain:'素色',grid:'格纹',dots:'圆点',ruled:'横线'});

const paperRole = /^(?:纸张|拼贴纸张|纸张背景|背景纸|底纸|衬纸|便签|便笺|标签便签|信纸|书写纸|笔记纸|格纹纸|方格纸|手帐纸|拼贴底纸|papers?|background paper|scrapbook paper|notepaper|notepad|sticky notes?)$/i;
const paperName = /底纸|背景纸|衬纸|便签|便笺|信纸|书写纸|笔记纸|格纹纸|方格纸|手帐纸|撕纸|\b(?:background paper|scrapbook paper|notepaper|notepad|sticky notes?)\b/i;
const decorationRole = /^(?:邮票|票根邮票|邮票票根|胶带|箭头|箭头指引|边框|角落装饰|stamps?|postage|washi tape|arrows?)$/i;

export function isPaperAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (asset.id === 'collage-paper') return true;
  const category=typeof asset.category==='string'?asset.category.trim():'';
  const group=typeof asset.group==='string'?asset.group.trim():'';
  // The current catalogue group supersedes the older category where it is specific.
  if (group==='纸张') return true;
  if (decorationRole.test(group) || decorationRole.test(category)) return false;
  if (paperRole.test(category)) return true;
  const name=typeof asset.name==='string'?asset.name:'';
  if (paperName.test(name)) return true;
  return [asset.tags,asset.functions].some(list=>Array.isArray(list)&&list.some(value=>typeof value==='string'&&paperRole.test(value.trim())));
}

function paperOutline(shape,width,height) {
  const unit=Math.min(width,height),margin=Math.max(1.25,unit*.015);
  const left=margin,right=width-margin,top=margin,bottom=height-margin;
  if (shape==='rect') return `<rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx="${unit*.008}"/>`;
  if (shape==='oval') return `<ellipse cx="${width/2}" cy="${height/2}" rx="${width/2-margin}" ry="${height/2-margin}"/>`;
  if (shape==='ticket') {
    // Circular edge notches retain their proportions even on wide or tall tickets.
    const radius=unit*.065,cy=height/2;
    return `<path d="M${left} ${top}H${right}V${cy-radius}A${radius} ${radius} 0 0 0 ${right} ${cy+radius}V${bottom}H${left}V${cy+radius}A${radius} ${radius} 0 0 0 ${left} ${cy-radius}Z"/>`;
  }
  // Uneven, repeatable deckle edges scale with the paper instead of a fixed bitmap.
  const edge=[.25,.9,.15,.6,.3,.95,.1,.65,.35,.85,.2,.7,.15,.95,.4,.75];
  const depth=unit*.025,points=[];
  for(let i=0;i<edge.length;i++)points.push([left+(right-left)*i/(edge.length-1),top+edge[i]*depth]);
  for(let i=0;i<edge.length;i++)points.push([right-edge[(i+5)%edge.length]*depth,top+(bottom-top)*i/(edge.length-1)]);
  for(let i=edge.length-1;i>=0;i--)points.push([left+(right-left)*i/(edge.length-1),bottom-edge[(i+9)%edge.length]*depth]);
  for(let i=edge.length-1;i>=0;i--)points.push([left+edge[(i+3)%edge.length]*depth,top+(bottom-top)*i/(edge.length-1)]);
  return `<polygon points="${points.map(point=>point.map(n=>Number(n.toFixed(3))).join(',')).join(' ')}"/>`;
}

export function paperArtSVG({color,pattern='plain',shape='torn',width=440,height=520}={}) {
  if (typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)) throw Error('底纸颜色必须是六位十六进制颜色。');
  if (typeof pattern!=='string'||!Object.hasOwn(paperPatterns,pattern)) throw Error('底纸花纹无效。');
  if (typeof shape!=='string'||!Object.hasOwn(paperShapes,shape)) throw Error('底纸形状无效。');
  if (![width,height].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=64&&n<=2048)) throw Error('底纸尺寸必须在 64 至 2048 像素之间。');
  const unit=Math.min(width,height),step=unit*.052,line=unit*.0022;
  const [red,green,blue]=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16));
  const ink=red*.299+green*.587+blue*.114>165?'#514B43':'#FFFFFF';
  const marks={
    plain:'',
    grid:`<path d="M${step} 0H0V${step}" fill="none" stroke="${ink}" stroke-width="${line}" opacity=".18"/>`,
    dots:`<circle cx="${step/2}" cy="${step/2}" r="${step*.07}" fill="${ink}" opacity=".25"/>`,
    ruled:`<path d="M0 ${step*.75}H${step}" stroke="${ink}" stroke-width="${line}" opacity=".20"/>`,
  };
  const outline=paperOutline(shape,width,height);
  // One opaque patterned fill keeps anti-aliased edges identical to plain paper.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="paper-clip">${outline}</clipPath><pattern id="paper-pattern" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><rect width="${step}" height="${step}" fill="${color}"/>${marks[pattern]}</pattern></defs><rect width="${width}" height="${height}" fill="${pattern==='plain'?color:'url(#paper-pattern)'}" clip-path="url(#paper-clip)"/></svg>`;
}
