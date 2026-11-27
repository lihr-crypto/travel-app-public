// Run from the repo root: swift scripts/generate-map-pin-assets.swift
// Rasterize the same upper semicircle + cubic tail used by ExpoAmapMapView.
// Source PNGs keep Google custom marker snapshots identical to the AMap pins.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let tokens = try String(contentsOf: root.appendingPathComponent("src/theme/tokens.ts"), encoding: .utf8)
let palette = tokens.components(separatedBy: "export const markerColors = {")[1]
  .components(separatedBy: "} as const;")[0]
let destination = root.appendingPathComponent("assets/map-pins", isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)

for variant in ["normal", "selected", "unscheduled", "cluster"] {
  let selected = variant == "selected"
  // Selection changes size and the complete silhouette outline, never the hue.
  // Keep Home's shared selected token untouched; only this Trip asset is blue-gray.
  let paletteVariant = selected ? "normal" : variant
  let expression = try NSRegularExpression(pattern: "\\b\(paletteVariant): '#([0-9A-Fa-f]{6})'")
  guard let match = expression.firstMatch(in: palette, range: NSRange(palette.startIndex..., in: palette)),
    let hexRange = Range(match.range(at: 1), in: palette),
    let rgb = UInt32(palette[hexRange], radix: 16)
  else { fatalError("Missing marker palette value: \(variant)") }
  let width: CGFloat = selected ? 50 : 44
  let height: CGFloat = selected ? 56 : 48
  let diameter: CGFloat = selected ? 34 : 28
  let centre = CGPoint(x: width / 2, y: 4 + diameter / 2)
  let radius = diameter / 2
  let tip = CGPoint(x: centre.x, y: height - 6)
  let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
  let color = CGColor(colorSpace: colorSpace, components: [CGFloat((rgb >> 16) & 255) / 255,
    CGFloat((rgb >> 8) & 255) / 255, CGFloat(rgb & 255) / 255, 1])!

  for scale in 1...3 {
    let pixelsWide = Int(width) * scale
    let pixelsHigh = Int(height) * scale
    guard let context = CGContext(data: nil, width: pixelsWide, height: pixelsHigh,
      bitsPerComponent: 8, bytesPerRow: pixelsWide * 4,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { fatalError("Cannot allocate pin bitmap") }
    context.translateBy(x: 0, y: CGFloat(pixelsHigh))
    context.scaleBy(x: CGFloat(scale), y: -CGFloat(scale))
    let path = CGMutablePath()
    path.move(to: tip)
    path.addCurve(to: CGPoint(x: centre.x - radius, y: centre.y),
      control1: CGPoint(x: centre.x - 6, y: tip.y - 7),
      control2: CGPoint(x: centre.x - radius, y: centre.y + radius * 0.8))
    // In this top-left coordinate system, increasing pi...2pi forms the top.
    path.addArc(center: centre, radius: radius, startAngle: .pi, endAngle: 2 * .pi, clockwise: false)
    path.addCurve(to: tip,
      control1: CGPoint(x: centre.x + radius, y: centre.y + radius * 0.8),
      control2: CGPoint(x: centre.x + 6, y: tip.y - 7))
    path.closeSubpath()
    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: 1), blur: 2,
      color: CGColor(gray: 0, alpha: 0.18))
    context.setFillColor(color)
    context.addPath(path)
    context.fillPath()
    context.restoreGState()
    if selected {
      // Keep the white stroke inside the full silhouette, including the tip.
      // A head-only circle would look like a second numbered icon on the pin.
      context.saveGState()
      context.addPath(path)
      context.clip()
      context.setStrokeColor(CGColor(colorSpace: colorSpace, components: [1, 1, 1, 1])!)
      context.setLineWidth(4)
      context.addPath(path)
      context.strokePath()
      context.restoreGState()
    }
    let suffix = scale == 1 ? "" : "@\(scale)x"
    let file = destination.appendingPathComponent("pin-\(variant)\(suffix).png")
    guard let image = context.makeImage(),
      let output = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { fatalError("Cannot write pin: \(file.path)") }
    CGImageDestinationAddImage(output, image, nil)
    guard CGImageDestinationFinalize(output) else { fatalError("Cannot finalize pin PNG") }
  }
}
print("Generated 1x/2x/3x marker assets from the current theme palette.")
