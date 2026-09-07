import AppKit
import CoreImage
import Foundation
let input=URL(fileURLWithPath:CommandLine.arguments[1]),output=URL(fileURLWithPath:CommandLine.arguments[2]);let context=CIContext()
guard let ci=CIImage(contentsOf:input,options:[.applyOrientationProperty:true]),var image=context.createCGImage(ci,from:ci.extent) else{exit(1)}
if CommandLine.arguments.count>3 {let inset=Double(CommandLine.arguments[3]) ?? 0; if let c=image.cropping(to:CGRect(x:Double(image.width)*inset,y:Double(image.height)*inset,width:Double(image.width)*(1-2*inset),height:Double(image.height)*(1-2*inset)).integral){image=c}}
let w=image.width,h=image.height;var bytes=[UInt8](repeating:0,count:w*h*4)
bytes.withUnsafeMutableBytes{p in let c=CGContext(data:p.baseAddress,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!;c.draw(image,in:CGRect(x:0,y:0,width:w,height:h))}
var samples=[[Double]]();for y in stride(from:0,to:h,by:max(1,h/50)){for x in stride(from:0,to:w,by:max(1,w/50)){if x<w/15 || x>w*14/15 || y<h/15 || y>h*14/15{let i=(y*w+x)*4;samples.append([Double(bytes[i]),Double(bytes[i+1]),Double(bytes[i+2])])}}}
let bg=(0..<3).map{c in samples.map{$0[c]}.sorted()[samples.count*3/4]}
for i in 0..<w*h {let d=sqrt((0..<3).map{pow(Double(bytes[i*4+$0])-bg[$0],2)}.reduce(0,+));let alpha=d<48 ? 0.0 : d>70 ? 1.0 : (d-48)/22;for c in 0..<4{bytes[i*4+c]=UInt8(Double(bytes[i*4+c])*alpha)}}
let provider=CGDataProvider(data:Data(bytes) as CFData)!;let result=CGImage(width:w,height:h,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),provider:provider,decode:nil,shouldInterpolate:true,intent:.defaultIntent)!
let bitmap=NSBitmapImageRep(cgImage:result);try bitmap.representation(using:.png,properties:[:])!.write(to:output)
