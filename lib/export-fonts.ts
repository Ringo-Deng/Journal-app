import type {Piece} from './journal';
import {userFontFamily} from './collage';

const embeddedFonts:Record<string,{family:string;url:string;format?:string;weight?:string;fallbackPen?:boolean}>={
  brush:{family:'Journal Brush',url:'/fonts/brush.woff2',format:'woff2'},
  pen:{family:'Journal Pen',url:'/fonts/pen.woff2',format:'woff2'},
  script:{family:'Journal Script',url:'/fonts/script.woff2',format:'woff2',weight:'400 700',fallbackPen:true},
  liyu:{family:'Journal Liyu',url:'/fonts/liyu-shoushu.ttf',format:'truetype'},
  xiaolai:{family:'Journal Xiaolai',url:'/fonts/xiaolai.ttf',format:'truetype'},
  yozai:{family:'Journal Yozai',url:'/fonts/yozai-medium.ttf',format:'truetype'},
  'kaiti-gb':{family:'Journal Kaiti GB',url:'/fonts/kaiti-gb.ttf',format:'truetype'},
  'kaiti-big5':{family:'Journal Kaiti Big5',url:'/fonts/kaiti-big5.ttf',format:'truetype'},
  'comic-neue':{family:'Journal Comic Neue',url:'/fonts/comic-neue.otf',format:'opentype',fallbackPen:true},
  'lobster-two':{family:'Journal Lobster Two',url:'/fonts/lobster-two.otf',format:'opentype',fallbackPen:true},
  purisa:{family:'Journal Purisa',url:'/fonts/purisa.otf',format:'opentype',fallbackPen:true},
  'wenkai':{family:'Journal Wenkai',url:'/fonts/lxgw-wenkai.woff2',format:'woff2',fallbackPen:true},
  'chill-round':{family:'Journal Chill Round',url:'/fonts/chill-round.woff2',format:'woff2',fallbackPen:true},
  'zcool-kuaile':{family:'Journal Zcool Kuaile',url:'/fonts/zcool-kuaile.woff2',format:'woff2',fallbackPen:true},
  'zcool-huangyou':{family:'Journal Zcool Huangyou',url:'/fonts/zcool-huangyou.woff2',format:'woff2',fallbackPen:true},
  'zcool-xiaowei':{family:'Journal Zcool Xiaowei',url:'/fonts/zcool-xiaowei.woff2',format:'woff2',fallbackPen:true},
  'noto-serif-sc':{family:'Journal Noto Serif SC',url:'/fonts/noto-serif-sc.woff2',format:'woff2',fallbackPen:true},
  'patrick-hand':{family:'Journal Patrick Hand',url:'/fonts/patrick-hand.woff2',format:'woff2',fallbackPen:true},
  'dancing-script':{family:'Journal Dancing Script',url:'/fonts/dancing-script.woff2',format:'woff2',weight:'400 700',fallbackPen:true},
};

async function dataURL(url:string){
  const response=await fetch(url);
  if(!response.ok)throw Error('手写字体未加载完成，请重试。');
  const blob=await response.blob();
  return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('无法读取字体。'));reader.onerror=()=>reject(Error('无法读取手写字体。'));reader.readAsDataURL(blob);});
}

/** Embed only fonts used on this page; SVG foreignObject cannot rely on the host document's font faces. */
export async function exportFontCSS(pieces:Piece[]) {
  const used=new Set(pieces.filter(p=>p.kind==='text'&&p.fontFamily).map(p=>p.fontFamily as string));
  if([...used].some(id=>embeddedFonts[id]?.fallbackPen||id.startsWith('user:')))used.add('pen');
  const css:string[]=[];
  for(const id of used){
    const builtIn=embeddedFonts[id];
    if(builtIn){
      const data=await dataURL(builtIn.url);
      css.push(`@font-face{font-family:'${builtIn.family}';src:url('${data}')${builtIn.format?` format('${builtIn.format}')`:''};font-weight:${builtIn.weight||'400'};font-style:normal;}`);
      continue;
    }
    const family=userFontFamily(id);
    if(family){
      const fontId=id.slice(5);
      const data=await dataURL(`/api/fonts/file/${fontId}`);
      css.push(`@font-face{font-family:'${family}';src:url('${data}');font-weight:400;font-style:normal;}`);
    }
  }
  return css.join('\n');
}
