import Foundation
import AppKit
import Vision
import CoreImage
if CommandLine.arguments.count != 3 { fputs("需要输入与输出路径\n", stderr); exit(1) }
do {
 let input = URL(fileURLWithPath: CommandLine.arguments[1])
 let output = URL(fileURLWithPath: CommandLine.arguments[2])
 let handler = VNImageRequestHandler(url: input, options: [:])
 let request = VNGenerateForegroundInstanceMaskRequest()
 try handler.perform([request])
 guard let result = request.results?.first, !result.allInstances.isEmpty else {
   fputs("没有识别到可以抠出的主体\n", stderr); exit(2)
 }
 let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
 let ci = CIImage(cvPixelBuffer: buffer)
 let context = CIContext()
 guard let cg = context.createCGImage(ci, from: ci.extent) else {exit(3)}
 let bitmap = NSBitmapImageRep(cgImage: cg)
 guard let png = bitmap.representation(using: .png, properties: [:]) else {exit(4)}
 try png.write(to: output)
} catch { fputs("主体识别失败\n", stderr); exit(5) }
