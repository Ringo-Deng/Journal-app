import Foundation
import AppKit
import Vision
import VideoToolbox
// Output paths and pixel rectangles are relative to the oriented input image.
let args=CommandLine.arguments
if args.count<5 {exit(1)}
let input=URL(fileURLWithPath:args[1]), out=URL(fileURLWithPath:args[2]), mode=args[3]
let tolerance=Double(args[4]) ?? 28
func rgba(_ image:CGImage)->[UInt8]{var bytes=[UInt8](repeating:0,count:image.width*image.height*4);bytes.withUnsafeMutableBytes { ptr in
 let c=CGContext(data:ptr.baseAddress,width:image.width,height:image.height,bitsPerComponent:8,bytesPerRow:image.width*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
 c.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))
};return bytes}
func makeImage(_ bytes:[UInt8],_ w:Int,_ h:Int)->CGImage {let provider=CGDataProvider(data:Data(bytes) as CFData)!;return CGImage(width:w,height:h,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),provider:provider,decode:nil,shouldInterpolate:true,intent:.defaultIntent)!}
func scaledImage(_ image:CGImage,_ scale:Double)->CGImage? {
 if scale>=1{return image}
 let width=max(1,Int(Double(image.width)*scale)),height=max(1,Int(Double(image.height)*scale))
 guard let context=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:width*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else{return nil}
 context.interpolationQuality = .high
 context.draw(image,in:CGRect(x:0,y:0,width:width,height:height))
 return context.makeImage()
}
func imageFromBuffer(_ buffer:CVPixelBuffer)->CGImage? {
 var image:CGImage?
 return VTCreateCGImageFromCVPixelBuffer(buffer,options:nil,imageOut:&image)==noErr ? image:nil
}
// Some downloaded JPGs have a transparency preview baked into their pixels.
// Require the same neutral, alternating grid on all four borders before treating
// it as backing. A checked sticker inside a plain sheet must remain artwork.
func removeCheckerBacking(_ pixels:[UInt8],_ w:Int,_ h:Int)->[UInt8]? {
 if min(w,h)<80{return nil}
 func grey(_ p:Int)->Int? {
  let i=p*4,r=Int(pixels[i]),g=Int(pixels[i+1]),b=Int(pixels[i+2])
  if pixels[i+3]<245 || min(r,g,b)<180 || max(r,g,b)-min(r,g,b)>8{return nil}
  return (r+g+b)/3
 }
 let top=(0..<w).map{grey($0)},left=(0..<h).map{grey($0*w)}
 let samples=(top+left).compactMap{$0}
 if samples.count<(w+h)*98/100{return nil}
 var histogram=[Int](repeating:0,count:256)
 for value in samples{histogram[value]+=1}
 guard let first=(180...255).max(by:{histogram[$0]<histogram[$1]}),
       let second=(180...255).filter({abs($0-first)>=12}).max(by:{histogram[$0]<histogram[$1]}) else{return nil}
 let low=min(first,second),high=max(first,second)
 if histogram[second]<samples.count/10 || high<235 || high-low>65{return nil}
 let matchTolerance=min(7,max(3,(high-low)/3))
 func label(_ value:Int?)->Int? {
  guard let value=value else{return nil}
  if abs(value-low)<=matchTolerance{return 0}
  if abs(value-high)<=matchTolerance{return 1}
  return nil
 }
 // Ignore antialiased transitions when measuring runs; retain their position in
 // the phase map so fractional cell sizes and cropped grid offsets still work.
 func axis(_ values:[Int?])->(phase:[Int],cell:Double)? {
  var phase=[Int](),changes=[Int](),last=label(values[0]) ?? 0,valid=0
  for (i,value) in values.enumerated(){
   if let next=label(value){valid+=1;if next != last{changes.append(i);last=next}}
   phase.append(last)
  }
  if valid<values.count*95/100 || changes.count<5{return nil}
  let runs=zip(changes,changes.dropFirst()).map{Double($1-$0)}.sorted()
  let cell=runs[runs.count/2]
  if cell<6 || cell>Double(values.count)/5{return nil}
  if runs.filter({abs($0-cell)<=max(2,cell*0.12)}).count<runs.count*9/10{return nil}
  return(phase,cell)
 }
 guard let horizontal=axis(top),let vertical=axis(left),
       abs(horizontal.cell-vertical.cell)<=max(2,horizontal.cell*0.12) else{return nil}
 let corner=horizontal.phase[0]
 func expected(_ p:Int)->Int{horizontal.phase[p%w] ^ vertical.phase[p/w] ^ corner}
 var borderMatches=0,borderCount=0
 for x in 0..<w{for p in [x,(h-1)*w+x]{borderCount+=1;if label(grey(p))==expected(p){borderMatches+=1}}}
 for y in 0..<h{for p in [y*w,y*w+w-1]{borderCount+=1;if label(grey(p))==expected(p){borderMatches+=1}}}
 if borderMatches<borderCount*95/100{return nil}

 // Validate each light connected region against the grid, including enclosed
 // windows in a frame. Solid white labels/cards fail this check and stay opaque.
 let n=w*h
 var light=[Bool](repeating:false,count:n),seen=[Bool](repeating:false,count:n)
 for p in 0..<n{if let value=grey(p){light[p]=value>=low-matchTolerance}}
 var cut=pixels,removed=0
 for start in 0..<n where light[start] && !seen[start] {
  var queue=[start],head=0,matches=0,counts=[0,0];seen[start]=true
  while head<queue.count {
   let p=queue[head];head+=1
   if let actual=label(grey(p)){counts[actual]+=1;if actual==expected(p){matches+=1}}
   let x=p%w,y=p/w
   for q in [x>0 ? p-1:-1,x+1<w ? p+1:-1,y>0 ? p-w:-1,y+1<h ? p+w:-1] where q>=0 {
    if light[q] && !seen[q]{seen[q]=true;queue.append(q)}
   }
  }
  if matches<queue.count*92/100 || min(counts[0],counts[1])<max(8,queue.count/12){continue}
  for p in queue{for c in 0..<4{cut[p*4+c]=0}}
  removed+=queue.count
 }
 // A bare checked paper is itself a material, not an empty transparency preview.
 if removed<n/10 || n-removed<max(25,n/200){return nil}
 // Unmatte neutral antialiased edges against the detected backing. Otherwise
 // JPEG's pale fringe remains visible around dark frames on a coloured page.
 for y in 1..<(h-1){for x in 1..<(w-1){
  let p=y*w+x,i=p*4
  if cut[i+3]==0 || ![p-1,p+1,p-w,p+w].contains(where:{cut[$0*4+3]==0}){continue}
  let r=Int(pixels[i]),g=Int(pixels[i+1]),b=Int(pixels[i+2])
  if max(r,g,b)-min(r,g,b)>8{continue}
  let value=Double(r+g+b)/3,back=Double(expected(p)==0 ? low:high)
  var foreground=value
  for dy in -1...1{for dx in -1...1{
   let q=((y+dy)*w+x+dx)*4
   let nr=Int(pixels[q]),ng=Int(pixels[q+1]),nb=Int(pixels[q+2])
   if pixels[q+3]>245 && max(nr,ng,nb)-min(nr,ng,nb)<=8{foreground=min(foreground,Double(nr+ng+nb)/3)}
  }}
  if foreground>Double(low-40) || value-foreground<8{continue}
  let alpha=max(0,min(1,(back-value)/(back-foreground)))
  for c in 0..<3{cut[i+c]=UInt8(foreground*alpha)}
  cut[i+3]=UInt8(255*alpha)
 }}
 return cut
}
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
 let inputData=try Data(contentsOf:input,options:.mappedIfSafe)
 guard let sourceImage=NSImage(data:inputData) else{fputs("无法读取输入图片。\n",stderr);exit(2)}
 guard let loaded=sourceImage.cgImage(forProposedRect:nil,context:nil,hints:nil) else{fputs("无法解析输入图片。\n",stderr);exit(2)}
 let scale=min(1,2400/Double(max(loaded.width,loaded.height)))
 guard var original=scaledImage(loaded,scale) else{fputs("无法缩放输入图片。\n",stderr);exit(2)}
 var checkerRemoved=false
 // Detect on the full source before a point/manual crop loses the grid borders.
 if !["crop","panels"].contains(mode),let cleaned=removeCheckerBacking(rgba(original),original.width,original.height){
  original=makeImage(cleaned,original.width,original.height);checkerRemoved=true
 }
 if args.count==9 {let nums=args[5...8].map{Double($0) ?? 0};let rect=CGRect(x:nums[0]*Double(original.width),y:nums[1]*Double(original.height),width:nums[2]*Double(original.width),height:nums[3]*Double(original.height)).integral;guard let cropped=original.cropping(to:rect) else{exit(3)};original=cropped}
 let w=original.width,h=original.height,n=w*h
 let pixels=rgba(original);var cut=pixels;var engine="本机 AI 主体识别";var pointMask=false
 // Full-width texture cuts are an explicit operation. A sticker sheet can have
 // strong colour bands too; automatic recognition must first follow its gaps.
 if mode == "panels" && args.count != 9 {
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
 // Prefer the outside border: large pale stickers inside the sheet are not
 // evidence for the backing colour. Fall back to the whole-sheet estimate only
 // when no dominant opaque border colour is available (e.g. a transparent frame).
 var borderGroups=[Int:(count:Int,r:Double,g:Double,b:Double)]()
 var borderCount=0
 func sampleBorder(_ i:Int){
  if pixels[i*4+3]<240{return}
  let r=Double(pixels[i*4]),g=Double(pixels[i*4+1]),b=Double(pixels[i*4+2])
  let key=(Int(r)/16)*256+(Int(g)/16)*16+Int(b)/16
  let old=borderGroups[key] ?? (0,0,0,0)
  borderGroups[key]=(old.count+1,old.r+r,old.g+g,old.b+b);borderCount+=1
 }
 for x in 0..<w{sampleBorder(x);sampleBorder((h-1)*w+x)}
 if h>2{for y in 1..<(h-1){sampleBorder(y*w);sampleBorder(y*w+w-1)}}
 if let dominant=borderGroups.values.max(by:{$0.count<$1.count}),dominant.count>=max(8,borderCount/4){
  background=[dominant.r,dominant.g,dominant.b].map{$0/Double(dominant.count)}
 }
 let uniform=corners.allSatisfy{p in (0..<3).allSatisfy{abs(Double(pixels[p*4+$0])-background[$0])<18}}
 let transparent=stride(from:3,to:pixels.count,by:4).filter{pixels[$0]<20}.count>n/50
 let whiteSheet=(uniform || (groups.values.map{$0.count}.max() ?? 0)>150) && background.min()!>130
 if mode == "point" && !checkerRemoved {
  // DeepSeek supplies only a padded semantic box. Within that small box,
  // Vision makes the pixel mask; keeping every foreground instance preserves
  // detached buttons, straps and decorations that belong to the clicked item.
  do {
   let handler=VNImageRequestHandler(cgImage:original,options:[:]);let request=VNGenerateForegroundInstanceMaskRequest();try handler.perform([request])
   if let result=request.results?.first,!result.allInstances.isEmpty {
    let buffer=try result.generateMaskedImage(ofInstances:result.allInstances,from:handler,croppedToInstancesExtent:false)
    if let masked=imageFromBuffer(buffer){cut=rgba(masked);pointMask=true;engine="点选精细抠图"}
   }
  } catch {fputs("点选主体蒙版不可用，将使用纸底分离：\(error.localizedDescription)\n",stderr)}
 }
 if mode == "crop" {engine="框选保留原底"}
 else if checkerRemoved {engine="棋盘格去底"}
 else if pointMask {}
 else if transparent && !["paper","single","ai","point"].contains(mode) {engine="透明素材分离"}
 else if mode=="paper" || mode=="dense" || mode=="single" || mode=="point" || mode=="panels" || (mode=="auto" && whiteSheet) {
  engine=mode == "dense" ? "密集贴纸细分" : "边缘连通纸底分离"
  // Low-cost, predictable paper removal: only erase paper-coloured pixels that are
  // connected to the outside border. Similar light colours enclosed by a sticker
  // are preserved instead of being removed globally.
  func paperDistance(_ i:Int)->Double {
   // Do not discount lightness differences: that erases cream/pastel paper
   // before its outline has a chance to become a separate component.
   let r=Double(pixels[i*4])-background[0],g=Double(pixels[i*4+1])-background[1],b=Double(pixels[i*4+2])-background[2]
   return sqrt(r*r+g*g+b*b)
  }
  let threshold=tolerance
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
  guard let masked=imageFromBuffer(buffer) else{exit(4)};cut=rgba(masked)
 }
 // A manual crop is one complete sticker; never split its letters or punctuation.
 if mode == "single" || mode == "crop" || mode == "point" {
  let tile = mode == "crop" ? pixels : cut
  let name=UUID().uuidString.lowercased()+".png"
  let bitmap=NSBitmapImageRep(cgImage:makeImage(tile,w,h))
  try bitmap.representation(using:.png,properties:[:])!.write(to:out.appendingPathComponent(name))
  let output:[String:Any] = ["items":[["file":name,"width":w,"height":h,"bounds":[0,0,1,1]]],"engine":mode == "crop" ? "框选保留原底" : mode == "point" ? engine : "框选整件去底","width":w,"height":h]
  print(String(data:try JSONSerialization.data(withJSONObject:output),encoding:.utf8)!)
  exit(0)
 }
 // Label the original alpha first. Erosion is used only to find potential
 // separation seeds; exported pixels always come from this original mask.
 var occupied=[Bool](repeating:false,count:n)
 for i in 0..<n{occupied[i]=cut[i*4+3]>45}
 func componentsOf(_ mask:[Bool])->(labels:[Int],parts:[[Int]]){
  var labels=[Int](repeating:0,count:n),parts=[[Int]]()
  for start in 0..<n where mask[start] && labels[start]==0{
   let label=parts.count+1;var queue=[start],head=0;labels[start]=label
   while head<queue.count{
    let p=queue[head];head+=1;let x=p%w,y=p/w
    for dy in -1...1{for dx in -1...1{
     let nx=x+dx,ny=y+dy
     if nx>=0 && nx<w && ny>=0 && ny<h{let q=ny*w+nx;if mask[q] && labels[q]==0{labels[q]=label;queue.append(q)}}
    }}
   };parts.append(queue)
  }
  return(labels,parts)
 }
 let originalParts=componentsOf(occupied)
 var components=originalParts.parts
 var bridgeSplits=0
 if ["auto","dense"].contains(mode) && w>2 && h>2{
  var eroded=[Bool](repeating:false,count:n)
  for y in 1..<(h-1){for x in 1..<(w-1){
   let i=y*w+x;eroded[i]=occupied[i] && occupied[i-1] && occupied[i+1] && occupied[i-w] && occupied[i+w]
  }}
  let cores=componentsOf(eroded).parts
  var groups=[[[Int]]](repeating:[],count:components.count)
  for core in cores{groups[originalParts.labels[core[0]]-1].append(core)}
  var restored=[[Int]](),ownership=[Int](repeating:0,count:n)
  for (index,component) in components.enumerated(){
   let minimumCore=max(25,Int(Double(component.count)*(mode == "dense" ? 0.08:0.20)))
   let major=groups[index].filter{$0.count>=minimumCore}.sorted{$0.count>$1.count}
   let retained=major.reduce(0){$0+$1.count}
   // Require substantial bodies. Fine lettering, stems, tiny detached details
   // and a single solid shape stay exactly as they were before erosion.
   if major.count<2 || major.count>(mode == "dense" ? 6:2) || Double(retained)<Double(component.count)*0.65{
    restored.append(component);continue
   }
   var queue=[Int](),head=0,parts=major
   for (j,core) in major.enumerated(){for p in core{ownership[p]=j+1;queue.append(p)}}
   while head<queue.count{
    let p=queue[head];head+=1;let x=p%w,y=p/w
    for dy in -1...1{for dx in -1...1{
     let nx=x+dx,ny=y+dy
     if nx>=0 && nx<w && ny>=0 && ny<h{
      let q=ny*w+nx
      if originalParts.labels[q]==index+1 && ownership[q]==0{
       ownership[q]=ownership[p];parts[ownership[p]-1].append(q);queue.append(q)
      }
     }
    }}
   }
   restored.append(contentsOf:parts);bridgeSplits+=parts.count-1
  }
  components=restored
 }
 // A crowded sheet must not use a higher minimum than an ordinary one.
 // Keep meaningful small stickers while filtering isolated compression specks.
 let minimum=max(8,n/12000)
 var results=[[String:Any]]()
 for component in components where component.count>=minimum{
  if results.count>=100{break}
  let minX=component.map{$0%w}.min()!,minY=component.map{$0/w}.min()!
  let maxX=component.map{$0%w}.max()!+1,maxY=component.map{$0/w}.max()!+1
  let cw=maxX-minX,ch=maxY-minY
  if cw<3 || ch<3 || max(cw,ch)<10{continue}
  var tile=[UInt8](repeating:0,count:cw*ch*4)
  for p in component{
   let from=p*4,to=((p/w-minY)*cw+p%w-minX)*4
   for c in 0..<4{tile[to+c]=cut[from+c]}
  }
  let name=UUID().uuidString.lowercased()+".png"
  let bitmap=NSBitmapImageRep(cgImage:makeImage(tile,cw,ch))
  try bitmap.representation(using:.png,properties:[:])!.write(to:out.appendingPathComponent(name))
  results.append(["file":name,"width":cw,"height":ch,"foregroundPixels":component.count,"bounds":[Double(minX)/Double(w),Double(minY)/Double(h),Double(cw)/Double(w),Double(ch)/Double(h)]])
 }
 if bridgeSplits>0{engine+=" · 粘连分离"}
 let output:[String:Any]=["items":results,"engine":engine,"width":w,"height":h,"bridgeSplits":bridgeSplits]
 let json=try JSONSerialization.data(withJSONObject:output);print(String(data:json,encoding:.utf8)!)
}catch{fputs("无法完成主体分离，请更换识别模式或手动框选后重试。\n",stderr);exit(5)}
