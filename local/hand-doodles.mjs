// Small, intentionally asymmetrical pen marks. AI chooses meaning/placement, never geometry.
export const handDoodles = {
  underline: {label:'随手下划线',ratio:.16,min:7,max:28,path:'M4 39 Q25 25 48 38 T94 32 M9 70 Q48 56 86 66'},
  wave: {label:'波浪线',ratio:.18,min:7,max:25,path:'M4 51 C12 15 20 17 27 49 S42 83 50 48 S64 17 72 50 S87 83 96 43'},
  arrow: {label:'弯箭头',ratio:.52,min:7,max:17,path:'M6 15 C20 77 58 89 90 36 M70 39 Q82 35 94 29 Q90 52 88 65'},
  circle: {label:'手绘圈',ratio:.64,min:7,max:22,path:'M77 13 C39 -1 3 16 5 48 C7 80 48 95 80 77 C109 60 94 20 63 10 M69 6 Q84 10 91 20'},
  heart: {label:'小爱心',ratio:.9,min:3,max:7,path:'M49 83 C38 70 8 50 10 30 C11 9 38 9 49 32 C59 4 89 9 91 29 C94 50 66 71 49 83'},
  sparkle: {label:'星光',ratio:1,min:3,max:7,path:'M45 8 Q45 40 14 45 Q43 48 47 79 Q48 50 77 44 Q50 42 45 8 M82 65 L83 86 M73 76 L92 74'},
  coffee: {label:'咖啡小画',ratio:1,min:5,max:10,path:'M20 38 Q43 35 66 39 L64 66 Q60 78 43 77 Q25 75 23 64 Z M68 43 C91 36 92 67 66 62 M14 83 Q46 93 78 82 M33 28 C19 19 42 14 32 5 M51 28 C39 19 61 16 52 7'},
  envelope: {label:'小信封',ratio:.68,min:5,max:11,path:'M8 23 L90 19 L92 78 L10 82 Z M10 25 L51 57 L89 22 M12 78 L35 53 M91 76 L67 51'},
  rain: {label:'小雨滴',ratio:1,min:4,max:8,path:'M27 11 C23 23 10 35 14 44 C20 57 42 52 40 39 C39 29 31 19 27 11 M70 43 C64 55 55 67 59 77 C65 90 85 83 83 71 C80 60 74 50 70 43 M69 9 L61 24 M31 69 L22 86'},
};
export function makeHandDoodle(p) {
  const preset=handDoodles[p.motif];
  if(!preset) throw Error('请用motif选择手绘圈线、弯箭头或小图案；复杂主题插画请从素材库选择。');
  const w=Math.max(preset.min,Math.min(preset.max,Number.isFinite(p.w)?p.w: preset.min+2));
  return {doodleMotif:p.motif,artLabel:preset.label,path:preset.path,w,h:w*1.43*preset.ratio};
}
export const doodleInstructions = `手绘点缀使用kind=doodle，motif只能为${Object.keys(handDoodles).join('|')}。不要输出path或drawing，程序会绘制细笔、有自然弧度的小图案。每跨页最多6处；爱心星光宽3..7，咖啡小画5..10，信封5..11，弯箭头7..17，下划线7..28。涂鸦只作小点缀，不充当半页主插画；不要白底方卡、厚边、软件图标或大块填色。选与内容有关的小画；圈线靠近需要强调的文字，箭头指向有关段落或素材，不指向空白或另一无关段落。`;
