import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {deflateSync, inflateSync} from 'node:zlib';
const run=promisify(execFile);
const native={skip:process.platform!=='darwin'||process.arch!=='arm64'};

function chunk(name,data){
 const type=Buffer.from(name);let crc=0xffffffff;
 for(const b of Buffer.concat([type,data])){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
 const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);out.writeUInt32BE((crc^0xffffffff)>>>0,data.length+8);return out;
}
function png(width,height,pixels){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc(height*(width*4+1));
 for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function decodePng(bytes){
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 assert.equal(bytes[24],8);assert.equal(bytes[25],6);assert.equal(bytes[28],0);
 const chunks=[];
 for(let p=8;p<bytes.length;){const len=bytes.readUInt32BE(p);if(bytes.toString('ascii',p+4,p+8)==='IDAT')chunks.push(bytes.subarray(p+8,p+8+len));p+=len+12}
 const raw=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(width*height*4),stride=width*4;
 const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c};
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)];assert.ok(filter<=4);
  for(let x=0;x<stride;x++){
   const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;
   const delta=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];pixels[i]=(raw[y*(stride+1)+1+x]+delta)&255;
  }
 }
 return{width,height,pixels};
}
function sheet(width,height,color=[255,255,255,255]){
 const pixels=Buffer.alloc(width*height*4);for(let i=0;i<width*height;i++)pixels.set(color,i*4);
 return{width,height,pixels,rect(x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixels.set(c,(yy*width+xx)*4)}};
}
async function segment(image,mode,verify,rect){
 const dir=await mkdtemp(join(tmpdir(),'journal-native-'));
 try{
  const source=join(dir,'source.png');await writeFile(source,png(image.width,image.height,image.pixels));
  const {stdout}=await run(resolve('local/segment'),[source,dir,mode,'28',...(rect||[]).map(String)],{timeout:30000});
  const result=JSON.parse(stdout);const outputs=await Promise.all(result.items.map(async item=>({...item,...decodePng(await readFile(join(dir,item.file)))})));
  await verify(result,outputs);
 }finally{await rm(dir,{recursive:true,force:true})}
}
const alphaCount=image=>{let count=0;for(let i=3;i<image.pixels.length;i+=4)if(image.pixels[i]>45)count++;return count};

test('dense preserves the full silhouette and small stickers at sheet scale',native,async()=>{
 const image=sheet(1000,1000,[0,0,0,0]);image.rect(20,20,30,30,[220,30,60,255]);image.rect(100,100,70,70,[30,100,200,255]);
 await segment(image,'dense',(_,items)=>{assert.equal(items.length,2);assert.deepEqual(items.map(i=>[i.width,i.height,alphaCount(i)]),[[30,30,900],[70,70,4900]])});
});

test('auto and dense split a thin bridge and restore every original foreground pixel',native,async()=>{
 const image=sheet(200,140,[0,0,0,0]);image.rect(20,25,60,80,[100,60,20,255]);image.rect(120,25,60,80,[20,80,120,255]);image.rect(80,64,40,2,[100,60,20,255]);
 for(const mode of ['auto','dense'])await segment(image,mode,(result,items)=>{
  assert.equal(items.length,2);assert.equal(result.bridgeSplits,1);
  assert.equal(items.reduce((sum,i)=>sum+alphaCount(i),0),9680);
  assert.equal(Math.min(...items.map(i=>i.bounds[0])),.1);assert.equal(Math.max(...items.map(i=>i.bounds[0]+i.bounds[2])),.9);
 });
});

test('dense retains a narrow stem on a solid subject instead of eroding it away',native,async()=>{
 const image=sheet(180,160,[0,0,0,0]);image.rect(40,30,80,60,[40,120,40,255]);image.rect(79,90,3,40,[40,120,40,255]);
 await segment(image,'dense',(_,items)=>{assert.equal(items.length,1);assert.equal(items[0].height,100);assert.equal(alphaCount(items[0]),4920)});
});

test('auto follows gaps between six patterned strips instead of full-width colour bands',native,async()=>{
 const image=sheet(400,600);
 for(let i=0;i<6;i++){
  image.rect(20,15+i*98,360,76,[244,230,204,255]);
  image.rect(20,15+i*98,360,2,[60,40,20,255]);image.rect(20,89+i*98,360,2,[60,40,20,255]);
  image.rect(20,15+i*98,2,76,[60,40,20,255]);image.rect(378,15+i*98,2,76,[60,40,20,255]);
  for(let x=32;x<365;x+=40)image.rect(x,30+i*98,15,30,[i%2?30:190,70,20,255]);
 }
 await segment(image,'auto',(_,items)=>{assert.equal(items.length,6);for(const item of items){assert.equal(item.width,360);assert.equal(item.height,76);assert.equal(alphaCount(item),360*76)}});
});

test('paper mode preserves pale cards and their enclosed light interiors',native,async()=>{
 const image=sheet(400,300);image.rect(25,30,140,220,[235,230,216,255]);image.rect(230,50,120,180,[220,232,237,255]);
 await segment(image,'paper',(_,items)=>{assert.equal(items.length,2);assert.deepEqual(items.map(i=>alphaCount(i)),[30800,21600])});
});

test('explicit paper removal works through a transparent outer frame',native,async()=>{
 const image=sheet(240,160,[0,0,0,0]);image.rect(10,10,220,140,[255,255,255,255]);image.rect(40,40,50,60,[20,90,180,255]);image.rect(140,40,50,60,[180,90,20,255]);
 await segment(image,'paper',(_,items)=>{assert.equal(items.length,2);assert.deepEqual(items.map(i=>alphaCount(i)),[3000,3000])});
});

test('point mode returns one padded crop and removes its connected paper background',native,async()=>{
 const image=sheet(300,300);image.rect(100,90,100,120,[40,110,180,255]);
 await segment(image,'point',(result,items)=>{
  assert.equal(items.length,1);assert.equal(result.width,180);assert.equal(result.height,180);
  assert.equal(alphaCount(items[0]),12000);
 },[.2,.2,.6,.6]);
});
