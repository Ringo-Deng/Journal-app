import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {paperArtSVG,paperShapes,paperPatterns,isPaperAsset} from '../local/paper-art.mjs';

const render=async options=>sharp(Buffer.from(paperArtSVG(options))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const alphaAt=({data,info},x,y)=>data[(y*info.width+x)*4+3];

test('paper detection supports current and legacy catalogue roles without treating paper decorations as sheets',()=>{
  const positive=[
    {id:'collage-paper'}, {category:'纸张'}, {category:'拼贴纸张'}, {category:'底纸'}, {category:'背景纸'},
    {group:'纸张',category:'其他'}, {name:'蓝色方格便签'}, {name:'花纹信纸'}, {name:'Yellow sticky note'},
    {category:'其他',tags:['复古','衬纸']}, {functions:['纸张背景']}, {functions:['衬纸']},
  ];
  const negative=[
    null,undefined,'纸张',{}, {name:'砖红纸质箭头',category:'箭头指引',tags:['纸质']},
    {name:'复古邮票',category:'邮票',tags:['纸品','纸张']}, {name:'邮票',functions:['票根邮票']},
    {name:'胶带',category:'胶带',tags:['纸张']}, {name:'兔子贴纸',tags:['纸质','贴纸']},
    {name:'paper butterfly',category:'装饰贴纸'}, {name:'A papercut flower'}, {tags:'背景纸'},
  ];
  positive.forEach(asset=>assert.equal(isPaperAsset(asset),true,JSON.stringify(asset)));
  negative.forEach(asset=>assert.equal(isPaperAsset(asset),false,JSON.stringify(asset)));
});

test('four paper silhouettes rasterize differently and preserve opaque centers and transparent page margins',async()=>{
  const masks=new Set();
  for (const shape of Object.keys(paperShapes)) {
    const raster=await render({color:'#F5E8C9',shape,width:320,height:400});
    const alpha=[];
    for(let i=3;i<raster.data.length;i+=4)alpha.push(raster.data[i]);
    masks.add(Buffer.from(alpha).toString('base64'));
    assert.equal(alphaAt(raster,160,200),255,shape);
    for(const [x,y] of [[0,0],[319,0],[0,399],[319,399]])assert.equal(alphaAt(raster,x,y),0,shape);
    if(shape==='ticket')assert.equal(alphaAt(raster,12,200),0,'ticket notch is cut out');
    if(shape==='rect')assert.equal(alphaAt(raster,12,200),255,'rectangle has no ticket notch');
    if(shape==='oval')assert.equal(alphaAt(raster,40,40),0,'oval corners are cut out');
  }
  assert.equal(masks.size,4);
});

test('grid, dots and rules visibly change paper while retaining every silhouette alpha pixel',async()=>{
  for(const shape of Object.keys(paperShapes))for(const color of ['#F5E8C9','#193A56']) {
    const plain=await render({shape,color,width:240,height:320}),images=new Set();
    for(const pattern of Object.keys(paperPatterns)) {
      const raster=await render({shape,color,pattern,width:240,height:320});
      images.add(raster.data.toString('base64'));
      let changed=0;
      for(let i=0;i<raster.data.length;i+=4) {
        assert.equal(raster.data[i+3],plain.data[i+3],`${shape}/${color}/${pattern}: texture must stay within outline`);
        if(raster.data[i+3]===255&&raster.data[i]!==plain.data[i])changed++;
      }
      if(pattern!=='plain')assert.ok(changed>100,`${shape}/${color}/${pattern} must remain visible`);
    }
    assert.equal(images.size,4,`${shape}/${color}`);
  }
});

test('paper rendering rejects external markup, non-enumerated shapes/patterns and unbounded sizes',()=>{
  for(const color of ['red','#abc','#12345678','url(https://example.com/paper.svg)','#123456"/><image href="https://example.com/x"/>',123456,null,{}])assert.throws(()=>paperArtSVG({color}),/颜色/);
  for(const field of ['shape','pattern'])for(const value of ['constructor','__proto__','toString','<svg/>','url(#test)',null,[],{}])assert.throws(()=>paperArtSVG({color:'#123456',[field]:value}),/无效/);
  for(const field of ['width','height'])for(const value of [0,-1,63,2049,Infinity,-Infinity,NaN,'400','400" onload="x',null])assert.throws(()=>paperArtSVG({color:'#123456',[field]:value}),/尺寸/);
  assert.throws(()=>paperArtSVG(),/颜色/);
});

test('paper edges and notches also render correctly at small, wide and tall dimensions',async()=>{
  for(const [width,height] of [[64,64],[512,128],[128,512]])for(const shape of Object.keys(paperShapes)) {
    const raster=await render({color:'#DBCCA5',shape,pattern:'grid',width,height});
    assert.equal(raster.info.width,width);assert.equal(raster.info.height,height);
    assert.equal(alphaAt(raster,width/2,height/2),255,`${shape}/${width}/${height}`);
    assert.equal(alphaAt(raster,0,height/2),0,`${shape}/${width}/${height}`);
  }
});
