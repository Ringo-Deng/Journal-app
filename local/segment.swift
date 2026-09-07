import Foundation
import AppKit
import Vision
import CoreImage
// Output paths and pixel rectangles are relative to the oriented input image.
let args=CommandLine.arguments
if args.count<5 {exit(1)}
let input=URL(fileURLWithPath:args[1]), out=URL(fileURLWithPath:args[2]), mode=args[3]
let tolerance=Double(args[4]) ?? 28
let ciContext=CIContext()
func rgba(_ image:CGImage)->[UInt8]{var bytes=[UInt8](repeating:0,count:image.width*image.height*4);bytes.withUnsafeMutableBytes { ptr in
 let c=CGContext(data:ptr.baseAddress,width:image.width,height:image.height,bitsPerComponent:8,bytesPerRow:image.width*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
 c.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))
};return bytes}
func makeImage(_ bytes:[UInt8],_ w:Int,_ h:Int)->CGImage {let provider=CGDataProvider(data:Data(bytes) as CFData)!;return CGImage(width:w,height:h,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),provider:provider,decode:nil,shouldInterpolate:true,intent:.defaultIntent)!}
// Find full-width/full-height changes in paper colour and texture, before removing
// any background. Histogram windows span several checks/stars to avoid slicing motifs.
func panelCuts(_ pixels:[UInt8],_ w:Int,_ h:Int,_ vertical:Bool)->[(Int,Double)] {
 let length=vertical ? w:h, cross=vertical ? h:w, bins=24
 if length<100{return []}
 var prefix=[Double](repeating:0,count:(length+1)*bins)
 for a in 0..<length {
  for b in 0..<bins{prefix[(a+1)*bins+b]=prefix[a*bins+b]}
  for t in stride(from:0,to:cross,by:max(1,cross/300)) {
   let x=vertical ? a:t,y=vertical ? t:a,i=(y*w+x)*4
   let r=Int(pixels[i]),g=Int(pixels[i+1]),b=Int(pixels[i+2])
   prefix[(a+1)*bins+min(7,(r+g+b)/96)]+=1
   prefix[(a+1)*bins+8+min(7,max(0,(b-r+256)/64))]+=1
   prefix[(a+1)*bins+16+min(7,(max(r,g,b)-min(r,g,b))/32)]+=1
  }
 }
 func contrast(_ a:Int,_ radius:Int)->Double{
  let lo=max(0,a-radius),hi=min(length,a+radius)
  var total=0.0,n1=0.0,n2=0.0
  for b in 0..<8{n1+=prefix[a*bins+b]-prefix[lo*bins+b];n2+=prefix[hi*bins+b]-prefix[a*bins+b]}
  if n1==0 || n2==0{return 0}
  for b in 0..<bins{total+=abs((prefix[a*bins+b]-prefix[lo*bins+b])/n1-(prefix[hi*bins+b]-prefix[a*bins+b])/n2)}
  return total/3
 }
 let radius=max(12,length/12),margin=max(20,length/9)
 var scores=[Double](repeating:0,count:length)
 for a in margin..<(length-margin){scores[a]=min(contrast(a,radius),contrast(a,radius*2))}
 var candidates=[(Int,Double)]()
 for a in margin..<(length-margin) where scores[a]>0.30 {
  if scores[a]>=scores[max(0,a-1)] && scores[a]>=scores[min(length-1,a+1)]{candidates.append((a,scores[a]))}
 }
 var chosen=[(Int,Double)]()
 for candidate in candidates.sorted(by:{$0.1>$1.1}) {
  if chosen.allSatisfy({abs($0.0-candidate.0)>margin}){chosen.append(candidate)}
  if chosen.count>=7{break}
 }
 return chosen.sorted{$0.0<$1.0}
}

do{
 guard var ci=CIImage(contentsOf:input,options:[.applyOrientationProperty:true]) else{exit(2)}
 let scale=min(1,2400/max(ci.extent.width,ci.extent.height));ci=ci.transformed(by:CGAffineTransform(scaleX:scale,y:scale))
 guard var original=ciContext.createCGImage(ci,from:ci.extent) else{exit(2)}
 if args.count==9 {let nums=args[5...8].map{Double($0) ?? 0};let rect=CGRect(x:nums[0]*Double(original.width),y:nums[1]*Double(original.height),width:nums[2]*Double(original.width),height:nums[3]*Double(original.height)).integral;guard let cropped=original.cropping(to:rect) else{exit(3)};original=cropped}
 let w=original.width,h=original.height,n=w*h
 let pixels=rgba(original);var cut=pixels;var engine="本机 AI 主体识别"
 // Pattern paper has meaningful coloured backing; preserve it in each panel.
 if ["auto","dense","panels"].contains(mode) && args.count != 9 {
  let horizontal=panelCuts(pixels,w,h,false),vertical=panelCuts(pixels,w,h,true)
  let hs=horizontal.map{$0.1}.max() ?? 0,vs=vertical.map{$0.1}.max() ?? 0
  let alongX=vs>hs,cuts=alongX ? vertical:horizontal
  let confidence=mode == "panels" ? 0.30:0.48
  let boundaries=cuts.filter{$0.1>=confidence}.map{$0.0}
  if !boundaries.isEmpty {
   let ends=[0]+boundaries+[alongX ? w:h];var items=[[String:Any]]()
   for k in 0..<(ends.count-1){
    let rect=alongX ? CGRect(x:ends[k],y:0,width:ends[k+1]-ends[k],height:h):CGRect(x:0,y:ends[k],width:w,height:ends[k+1]-ends[k])
    if let tile=original.cropping(to:rect){let name=UUID().uuidString.lowercased()+".png";try NSBitmapImageRep(cgImage:tile).representation(using:.png,properties:[:])!.write(to:out.appendingPathComponent(name));items.append(["file":name,"width":tile.width,"height":tile.height,"bounds":[rect.minX/Double(w),rect.minY/Double(h),rect.width/Double(w),rect.height/Double(h)]])}
   }
   print(String(data:try JSONSerialization.data(withJSONObject:["items":items,"engine":"底色 / 纹样分区（保留纸底）","width":w,"height":h]),encoding:.utf8)!);exit(0)
  }
 }
 let corners=[0,w-1,(h-1)*w,h*w-1];var background=(0..<3).map{c in corners.map{Double(pixels[$0*4+c])}.reduce(0,+)/4}
 // Estimate the dominant light paper colour from the whole sheet, including
 // cream, grey and pastel paper, rather than averaging four occupied corners.
 var groups=[Int:(count:Int,r:Double,g:Double,b:Double)]()
 for i in stride(from:0,to:n,by:max(1,n/40000)) where pixels[i*4+3]>240 {
  let r=Double(pixels[i*4]),g=Double(pixels[i*4+1]),b=Double(pixels[i*4+2])
  if min(r,g,b)<130 || max(r,g,b)-min(r,g,b)>75{continue}
  let key=(Int(r)/16)*256+(Int(g)/16)*16+Int(b)/16
  let old=groups[key] ?? (0,0,0,0);groups[key]=(old.count+1,old.r+r,old.g+g,old.b+b)
 }
 if let dominant=groups.values.max(by:{$0.count<$1.count}),dominant.count>40{background=[dominant.r,dominant.g,dominant.b].map{$0/Double(dominant.count)}}
 let uniform=corners.allSatisfy{p in (0..<3).allSatisfy{abs(Double(pixels[p*4+$0])-background[$0])<18}}
 let transparent=stride(from:3,to:pixels.count,by:4).filter{pixels[$0]<20}.count>n/50
 let whiteSheet=(uniform || (groups.values.map{$0.count}.max() ?? 0)>150) && background.min()!>130
 if mode == "crop" {engine="框选保留原底"}
 else if transparent {engine="透明素材分离"}
 else if mode=="paper" || mode=="dense" || mode=="single" || mode=="panels" || (mode=="auto" && whiteSheet) {
  engine=mode == "dense" ? "密集贴纸细分" : "边缘连通纸底分离"
  // Low-cost, predictable paper removal: only erase paper-coloured pixels that are
  // connected to the outside border. Similar light colours enclosed by a sticker
  // are preserved instead of being removed globally.
  let bgLum=background.reduce(0,+)/3
  func paperDistance(_ i:Int)->Double {
   let rgb=(0..<3).map{Double(pixels[i*4+$0])},lum=rgb.reduce(0,+)/3
   let chroma=sqrt((0..<3).map{pow((rgb[$0]-lum)-(background[$0]-bgLum),2)}.reduce(0,+))
   let raw=sqrt((0..<3).map{pow(rgb[$0]-background[$0],2)}.reduce(0,+))
   return (lum>175 && abs(lum-bgLum)<55 && chroma<12) ? abs(lum-bgLum)*0.55+chroma*1.5:raw
  }
  let threshold=tolerance+10
  var paper=[Bool](repeating:false,count:n),queue=[Int](),head=0
  func seed(_ i:Int){if !paper[i] && (pixels[i*4+3]<20 || paperDistance(i)<=threshold){paper[i]=true;queue.append(i)}}
  for x in 0..<w {seed(x);seed((h-1)*w+x)}
  if h>2 {for y in 1..<(h-1){seed(y*w);seed(y*w+w-1)}}
  while head<queue.count {let p=queue[head];head+=1;let x=p%w,y=p/w
   if x>0 {let q=p-1;if !paper[q] && (pixels[q*4+3]<20 || paperDistance(q)<=threshold){paper[q]=true;queue.append(q)}}
   if x+1<w {let q=p+1;if !paper[q] && (pixels[q*4+3]<20 || paperDistance(q)<=threshold){paper[q]=true;queue.append(q)}}
   if y>0 {let q=p-w;if !paper[q] && (pixels[q*4+3]<20 || paperDistance(q)<=threshold){paper[q]=true;queue.append(q)}}
   if y+1<h {let q=p+w;if !paper[q] && (pixels[q*4+3]<20 || paperDistance(q)<=threshold){paper[q]=true;queue.append(q)}}
  }
  if queue.count<max(8,n/200){throw NSError(domain:"纸底不够统一，请继续识别切换策略或手动框选",code:6)}
  for i in 0..<n {
   if paper[i]{for c in 0..<4{cut[i*4+c]=0};continue}
   let x=i%w,y=i/w
   let edge=(x>0 && paper[i-1]) || (x+1<w && paper[i+1]) || (y>0 && paper[i-w]) || (y+1<h && paper[i+w])
   if edge {for c in 0..<4{cut[i*4+c]=UInt8(Double(pixels[i*4+c])*0.86)}}
  }
 } else {
  let handler=VNImageRequestHandler(cgImage:original,options:[:]);let request=VNGenerateForegroundInstanceMaskRequest();try handler.perform([request])
  guard let result=request.results?.first,!result.allInstances.isEmpty else {throw NSError(domain:"没有识别到主体，请尝试纸底分离或手动框选",code:4)}
  let buffer=try result.generateMaskedImage(ofInstances:result.allInstances,from:handler,croppedToInstancesExtent:false)
  guard let masked=ciContext.createCGImage(CIImage(cvPixelBuffer:buffer),from:CGRect(x:0,y:0,width:w,height:h)) else{exit(4)};cut=rgba(masked)
 }
 // A manual crop is one complete sticker; never split its letters or punctuation.
 if mode == "single" || mode == "crop" {
  let tile = mode == "crop" ? pixels : cut
  let name=UUID().uuidString.lowercased()+".png"
  let bitmap=NSBitmapImageRep(cgImage:makeImage(tile,w,h))
  try bitmap.representation(using:.png,properties:[:])!.write(to:out.appendingPathComponent(name))
  let output:[String:Any] = ["items":[["file":name,"width":w,"height":h,"bounds":[0,0,1,1]]],"engine":mode == "crop" ? "框选保留原底" : "框选整件去底","width":w,"height":h]
  print(String(data:try JSONSerialization.data(withJSONObject:output),encoding:.utf8)!)
  exit(0)
 }
 // Dense sheets retain narrow gaps instead of merging downsampled cells.
 let block=1,gw=(w+block-1)/block,gh=(h+block-1)/block
 var occupied=[Bool](repeating:false,count:gw*gh)
 for y in 0..<h {for x in 0..<w {if cut[(y*w+x)*4+3]>45{occupied[(y/block)*gw+x/block]=true}}}
 if mode == "dense" && w>2 && h>2 {
  let mask=occupied
  for y in 1..<(h-1) {for x in 1..<(w-1) {
   occupied[y*w+x] = mask[y*w+x] && mask[y*w+x-1] && mask[y*w+x+1] && mask[(y-1)*w+x] && mask[(y+1)*w+x]
  }}
 }
 var labels=[Int](repeating:0,count:gw*gh);var components:[[Int]]=[];var label=0
 for start in 0..<occupied.count where occupied[start] && labels[start]==0 {
  label+=1;var queue=[start];labels[start]=label;var pos=0
  while pos<queue.count {let p=queue[pos];pos+=1;let x=p%gw,y=p/gw
   for dy in -1...1 {for dx in -1...1 {let nx=x+dx,ny=y+dy;if (mode != "dense" || abs(dx)+abs(dy)==1) && nx>=0 && nx<gw && ny>=0 && ny<gh {let q=ny*gw+nx;if occupied[q] && labels[q]==0{labels[q]=label;queue.append(q)}}}}
  };components.append(queue)
 }
 let minimum=max(5,gw*gh/(mode == "dense" ? 900 : 2500))
 var results:[[String:Any]]=[]
 for (index,component) in components.enumerated() where component.count>=minimum {
  if results.count>=100{break}
  let minX=component.map{$0%gw}.min()!*block,minY=component.map{$0/gw}.min()!*block
  let maxX=min(w,(component.map{$0%gw}.max()!+1)*block),maxY=min(h,(component.map{$0/gw}.max()!+1)*block)
  let cw=maxX-minX,ch=maxY-minY;if cw<10 || ch<10{continue}
  var tile=[UInt8](repeating:0,count:cw*ch*4)
  for y in minY..<maxY {for x in minX..<maxX {if labels[(y/block)*gw+x/block]==index+1 {let from=(y*w+x)*4,to=((y-minY)*cw+x-minX)*4;for c in 0..<4{tile[to+c]=cut[from+c]}}}}
  let name=UUID().uuidString.lowercased()+".png";let bitmap=NSBitmapImageRep(cgImage:makeImage(tile,cw,ch));try bitmap.representation(using:.png,properties:[:])!.write(to:out.appendingPathComponent(name))
  results.append(["file":name,"width":cw,"height":ch,"bounds":[Double(minX)/Double(w),Double(minY)/Double(h),Double(cw)/Double(w),Double(ch)/Double(h)]])
 }
 let output:[String:Any]=["items":results,"engine":engine,"width":w,"height":h]
 let json=try JSONSerialization.data(withJSONObject:output);print(String(data:json,encoding:.utf8)!)
}catch{fputs("无法完成主体分离，请更换识别模式或手动框选后重试。\n",stderr);exit(5)}
