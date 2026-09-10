// Editorial geometry uses existing drawing layers; the model never supplies SVG paths.
const shapes = Object.freeze({
  'editorial-rect': {label:'矩形色块',path:'M0 0 H100 V100 H0 Z',min:3,max:44},
  'editorial-circle': {label:'圆形色块',path:'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z',min:5,max:32,aspect:1},
  'editorial-semicircle': {label:'半圆色块',path:'M0 100 A50 100 0 0 1 100 100 Z',min:5,max:32,aspect:.5},
  'editorial-line': {label:'细分隔线',path:'M0 0 H100 V100 H0 Z',min:5,max:40},
});

export function isEditorialShape(piece) {
  return piece?.kind === 'doodle' && typeof piece.doodleMotif === 'string' && Object.hasOwn(shapes, piece.doodleMotif);
}

function dimension(value, low, high, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) throw Error('几何排版尺寸无效，请使用有限数字。');
  return Math.max(low, Math.min(high, value));
}

export function makeEditorialShape(p, ratio = 1.43) {
  if (typeof p.motif !== 'string' || !Object.hasOwn(shapes, p.motif)) throw Error('几何排版只能选择矩形、圆形、半圆或细分隔线。');
  const preset = shapes[p.motif];
  const pageRatio = Number.isFinite(ratio) ? Math.max(.6, Math.min(2.5, ratio)) : 1.43;
  const color = p.color === undefined ? '#7E8989' : p.color;
  if (typeof color !== 'string' || !/^#[a-f0-9]{6}$/i.test(color)) throw Error('几何排版颜色无效，请使用六位十六进制颜色。');
  let w = dimension(p.w, preset.min, preset.max, p.motif === 'editorial-line' ? 18 : 22);
  // The viewBox stretches to the piece bounds. Convert horizontal percentages to
  // vertical percentages so circles remain circular for every supported page ratio.
  let h;
  if (preset.aspect) {
    w = Math.min(w, 50 / (pageRatio * preset.aspect));
    h = w * pageRatio * preset.aspect;
  } else if (p.motif === 'editorial-line') {
    h = .16 * pageRatio;
  } else h = dimension(p.h, 3, 50, 26);
  return {
    doodleMotif:p.motif,artLabel:preset.label,w,h,color,stretch:true,
    drawing:[{path:preset.path,fill:color,stroke:'none',width:1}],
    frame:'plain',background:undefined,
  };
}

export const editorialShapeInstructions = `几何主视觉使用kind=doodle，motif只能为editorial-rect|editorial-circle|editorial-semicircle|editorial-line。这些是纯色几何构图，不是手绘小点缀；不要输出path、drawing或SVG，程序固定绘制。颜色使用六位hex，宜沿整页主色保持一致。矩形w为3..44、h为3..50；圆形和半圆w为5..32，程序按纸面比例计算h，不要用椭圆代替圆；分隔线w为5..40，程序保持细水平线。最多选择1..3块主视觉并按需加少量分隔线，不要求每页都有。几何只放正文和照片之外的留白，不能用作文字底板或遮盖文字；边界须完整留在单页内，不跨书脊、不出血。标题、正文和几何用共同边缘对齐。不要把半页色块与手绘小图案混用。`;
