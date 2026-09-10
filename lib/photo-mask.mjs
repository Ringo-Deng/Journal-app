/** Shared normalized paths and cover geometry for browser preview and PNG output. */
export const PHOTO_MASK_SHAPES = { circle:'圆形', heart:'心形', star:'圆角星形', rounded:'圆角矩形' };
// Legacy uploads use UUIDs; photo-library imports use a content hash.
export const PHOTO_UPLOAD = /^\/uploads\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|photo-[0-9a-f]{32})\.(jpg|png|webp)$/;
const fail = message => Object.assign(new Error(message), {status:400});
export function maskPath(shape) {
  if(shape==='circle')return 'M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z';
  if(shape==='heart')return 'M 50 100 C 43 91 0 65 0 30 C 0 -2 34 -10 50 18 C 66 -10 100 -2 100 30 C 100 65 57 91 50 100 Z';
  if(shape==='rounded')return 'M 18 0 H 82 Q 100 0 100 18 V 82 Q 100 100 82 100 H 18 Q 0 100 0 82 V 18 Q 0 0 18 0 Z';
  if(shape!=='star')throw fail('未知照片蒙版形状。');
  // Quadratic corners, then normalize the actual curve bounds to fill the frame.
  const points=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?23:50;return [50+r*Math.cos(a),50+r*Math.sin(a)];});
  const corners=points.map((p,i)=>{const prev=points[(i+9)%10],next=points[(i+1)%10],t=.14;return {a:p.map((v,j)=>v+(prev[j]-v)*t),p,b:p.map((v,j)=>v+(next[j]-v)*t)};});
  const samples=corners.flatMap(({a,p,b})=>[0,1,...[0,1].map(j=>(a[j]-p[j])/(a[j]-2*p[j]+b[j])).filter(t=>t>0&&t<1)].map(t=>a.map((v,j)=>(1-t)**2*v+2*(1-t)*t*p[j]+t*t*b[j])));
  const mins=[0,1].map(j=>Math.min(...samples.map(p=>p[j]))),maxs=[0,1].map(j=>Math.max(...samples.map(p=>p[j])));
  const coord=p=>p.map((v,j)=>((v-mins[j])/(maxs[j]-mins[j])*100).toFixed(5)).join(' ');
  return `M ${coord(corners[0].a)} `+corners.map(({a,p,b},i)=>`${i?'L '+coord(a)+' ':''}Q ${coord(p)} ${coord(b)}`).join(' ')+' Z';
}
export function validateMaskInput(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('照片蒙版参数无效。');
  input={photoRotation:0,...input};
  const keys=['src','shape','crop','cropY','cropZoom','flipX','flipY','width','height','bookId','spreadId','pieceId','revision','photoRotation'];
  if(Object.keys(input).some(key=>!keys.includes(key)))throw fail('照片蒙版包含未知参数。');
  if(typeof input.src!=='string'||!PHOTO_UPLOAD.test(input.src))throw fail('请选择本机已上传的照片。');
  if(!Object.hasOwn(PHOTO_MASK_SHAPES,input.shape))throw fail('未知照片蒙版形状。');
  for(const [key,min,max] of [['photoRotation',-180,180],['crop',0,100],['cropY',0,100],['cropZoom',1,4],['width',1,16384],['height',1,16384],['revision',0,Number.MAX_SAFE_INTEGER]]) {
    if(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<min||input[key]>max)throw fail('照片蒙版尺寸或取景参数无效。');
  }
  if(!Number.isSafeInteger(input.revision)||input.width/input.height>100||input.height/input.width>100)throw fail('照片框比例无效。');
  for(const key of ['flipX','flipY'])if(typeof input[key]!=='boolean')throw fail('照片翻转参数无效。');
  for(const key of ['bookId','spreadId','pieceId'])if(typeof input[key]!=='string'||!input[key]||input[key].length>160)throw fail('照片位置无效。');
  return {...input};
}
export function rotatedMaskBounds(width,height,angle=0){
  const radians=angle*Math.PI/180,c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
  return {width:width*c+height*s,height:width*s+height*c};
}
export function maskImageRect(iw,ih,width,height,crop=50,cropY=50,zoom=1,angle=0) {
  const bounds=rotatedMaskBounds(width,height,angle);
  const scale=Math.max(bounds.width/iw,bounds.height/ih)*zoom,w=iw*scale,h=ih*scale;
  return {x:(width-bounds.width)/2+(bounds.width-w)*crop/100,y:(height-bounds.height)/2+(bounds.height-h)*cropY/100,width:w,height:h};
}
export function maskOutputSize(width,height) {
  const scale=4096/Math.max(width,height);
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
