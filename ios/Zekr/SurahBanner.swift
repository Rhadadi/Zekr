import SwiftUI
import UIKit
import ZekrKit

/// The header at the start of a surah: its name in a double frame between two ornaments (a fine line ending
/// in a diamond, a leaf and a gold rosette, drawn for Zekr). Same design as the web (SurahBanner.tsx).
struct SurahBanner: View {
    let name: String
    let font: QuranFont

    var body: some View {
        // left to right, so the ornaments point outward whatever the app language
        HStack(spacing: -9) {
            Ornament()
            Text("سورة \(name)")
                .font(.quran(font, size: 22))
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
                .background(Color.bannerFill, in: RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.bannerFrame, lineWidth: 1))
                .padding(5)
                .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.bannerFrame, lineWidth: 1.5))
                .environment(\.layoutDirection, .rightToLeft)
            Ornament().scaleEffect(x: -1)
        }
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("سورة \(name)")
        .accessibilityAddTraits(.isHeader)
    }
}

/// One end of the banner, drawn in a 64 × 48 grid (the same paths as the web's SVG).
private struct Ornament: View {
    var body: some View {
        Canvas { context, size in
            let k = size.width / 64
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * k, y: y * k) }
            var line = Path()
            line.move(to: p(2, 24))
            line.addLine(to: p(20, 24))
            context.stroke(line, with: .color(.bannerFrame), lineWidth: 1.5)

            var diamond = Path()
            diamond.move(to: p(3, 24))
            diamond.addLine(to: p(7, 20))
            diamond.addLine(to: p(11, 24))
            diamond.addLine(to: p(7, 28))
            diamond.closeSubpath()
            context.fill(diamond, with: .color(.bannerFrame))

            var leaf = Path()
            leaf.move(to: p(18, 24))
            leaf.addCurve(to: p(54, 13), control1: p(26, 10), control2: p(40, 7))
            leaf.addCurve(to: p(54, 35), control1: p(45, 18), control2: p(45, 30))
            leaf.addCurve(to: p(18, 24), control1: p(40, 41), control2: p(26, 38))
            leaf.closeSubpath()
            context.stroke(leaf, with: .color(.bannerFrame), lineWidth: 1.5)

            var inner = Path()
            inner.move(to: p(25, 24))
            inner.addCurve(to: p(47, 17), control1: p(31, 16), control2: p(40, 14))
            inner.addCurve(to: p(47, 31), control1: p(42, 21), control2: p(42, 27))
            inner.addCurve(to: p(25, 24), control1: p(40, 34), control2: p(31, 32))
            inner.closeSubpath()
            context.fill(inner, with: .color(Color.bannerFrame.opacity(0.18)))

            for (x, y) in [(54.0, 18.0), (59.2, 21.0), (59.2, 27.0), (54.0, 30.0), (48.8, 27.0), (48.8, 21.0)] {
                let r = 3.4 * k
                context.fill(Path(ellipseIn: CGRect(x: x * k - r, y: y * k - r, width: 2 * r, height: 2 * r)), with: .color(.flower))
            }
            let r = 2.6 * k
            context.fill(Path(ellipseIn: CGRect(x: 54 * k - r, y: 24 * k - r, width: 2 * r, height: 2 * r)), with: .color(.flowerHeart))
        }
        .frame(width: 60, height: 45)
        .accessibilityHidden(true)
    }
}

private extension Color {
    static let bannerFrame = Color(UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0.50, green: 0.75, blue: 0.62, alpha: 1) : UIColor(red: 0.25, green: 0.48, blue: 0.35, alpha: 1) })
    static let bannerFill = Color(UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0.09, green: 0.125, blue: 0.11, alpha: 1) : UIColor(red: 0.957, green: 0.973, blue: 0.925, alpha: 1) })
    static let flower = Color(red: 0.85, green: 0.65, blue: 0.18)
    static let flowerHeart = Color(red: 0.60, green: 0.42, blue: 0.06)
}
