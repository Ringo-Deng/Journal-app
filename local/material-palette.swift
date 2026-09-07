import Foundation
import ImageIO
import CoreGraphics
var output:[String:[String]]=[:]
for file in CommandLine.arguments.dropFirst() {
 autoreleasepool {
  guard let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:file) as CFURL,nil),let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:32,kCGImageSourceCreateThumbnailWithTransform:true] as CFDictionary) else {return}
  let w=image.width,h=image.height;var bytes=[UInt8](repeating:0,count:w*h*4)
  bytes.withUnsafeMutableBytes {p in
   let ctx=CGContext(data:p.baseAddress,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
   ctx.draw(image,in:CGRect(x:0,y:0,width:w,height:h))
  }
  var counts:[Int:Int]=[:]
  for i in 0..<(w*h) {
   let alpha=Double(bytes[i*4+3])/255
   if alpha<0.5 {continue}
   let rgb=(0..<3).map{min(255,Int(Double(bytes[i*4+$0])/alpha))}
   if rgb.min()!>239 {continue}
   let key=(rgb[0]/32)*64+(rgb[1]/32)*8+rgb[2]/32
   counts[key,default:0]+=1
  }
  output[file]=counts.sorted{a,b in a.value==b.value ? a.key<b.key : a.value>b.value}.prefix(4).map{item in let k=item.key;return String(format:"#%02x%02x%02x",(k/64)*32+16,((k/8)%8)*32+16,(k%8)*32+16)}
 }
}
print(String(data:try JSONSerialization.data(withJSONObject:output),encoding:.utf8)!)
