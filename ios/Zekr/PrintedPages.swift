import SwiftUI
import UIKit
import ZekrKit

/// The owner's printed mushaf as pictures, one per page, with the place of every ayah on it. Private content: the
/// pictures are not in git (`tools/mushaf_pages.py --ios-dir ios/Zekr/Resources/mushaf` writes them for a personal
/// build); without them the app shows the text pages instead.
enum PrintedPages {
    struct Map: Decodable {
        let v: String
        let pages: [Entry]
    }

    struct Entry: Decodable {
        let n: Int
        /// The first ayah of the page; `a[k]` places ayah `first + k`.
        let first: Int
        /// Pixels of the picture, for its shape.
        let w: Int
        let h: Int
        /// For each ayah, its rectangles (x, y, width, height) in thousandths of the picture.
        let a: [[[Int]]]
    }

    static let map: Map? = {
        guard let url = Bundle.main.url(forResource: "map", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Map.self, from: data)
    }()

    static var available: Bool { map != nil }

    static func entry(_ n: Int) -> Entry? {
        guard let map, (1...map.pages.count).contains(n) else { return nil }
        return map.pages[n - 1]
    }

    private static let cache = NSCache<NSNumber, UIImage>()

    static func image(_ n: Int) -> UIImage? {
        if let hit = cache.object(forKey: NSNumber(value: n)) { return hit }
        guard let url = Bundle.main.url(forResource: String(format: "%03d", n), withExtension: "webp"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(image, forKey: NSNumber(value: n))
        return image
    }
}

/// The page colour, as a filter over the picture: the edition is blue as printed.
private struct PageTint: ViewModifier {
    let color: PageColor

    @ViewBuilder func body(content: Content) -> some View {
        switch color {
        case .blue: content
        case .green: content.hueRotation(.degrees(-60))
        case .purple: content.hueRotation(.degrees(70))
        case .pink: content.hueRotation(.degrees(130))
        case .dark: content.colorInvert().hueRotation(.degrees(180))
        }
    }
}

/// One printed page. Tap an ayah (its rectangles are over the picture) for its panel; tap elsewhere for the options.
struct PrintedPageView: View {
    let number: Int
    let highlighted: Int?
    let onAyah: (Int, CGPoint) -> Void
    let onPage: () -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        if let entry = PrintedPages.entry(number), let image = PrintedPages.image(number) {
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    picture(image, in: geo.size)
                    ForEach(0..<entry.a.count, id: \.self) { k in
                        ayahAreas(id: entry.first + k, rects: entry.a[k], in: geo.size)
                    }
                }
            }
            .aspectRatio(CGFloat(entry.w) / CGFloat(entry.h), contentMode: .fit)
            .padding(.bottom, 8)
        } else {
            Color.clear.frame(height: 400)
        }
    }

    private func picture(_ image: UIImage, in size: CGSize) -> some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .modifier(PageTint(color: model.settings.settings.pageColor))
            .frame(width: size.width, height: size.height)
            .contentShape(Rectangle())
            .onTapGesture(perform: onPage)
            .accessibilityLabel(LocalizedText.pageTitle(number, language: model.language))
    }

    /// The rectangles of one ayah, over the picture. The first is the ayah's element for VoiceOver, with its text.
    private func ayahAreas(id: Int, rects: [[Int]], in size: CGSize) -> some View {
        let label = (try? model.store?.arabic(ayahID: id, script: model.settings.settings.script)) ?? ""
        let shown = id == highlighted
        return ZStack(alignment: .topLeading) {
            ForEach(0..<rects.count, id: \.self) { j in
                area(rects[j], in: size, shown: shown, id: id)
                    .accessibilityHidden(j != 0)
                    .accessibilityLabel(j == 0 ? label : "")
            }
        }
    }

    @ViewBuilder private func area(_ r: [Int], in size: CGSize, shown: Bool, id: Int) -> some View {
        if r.count == 4 {
            let w = size.width * CGFloat(r[2]) / 1000
            let h = size.height * CGFloat(r[3]) / 1000
            let x = size.width * CGFloat(r[0]) / 1000
            let y = size.height * CGFloat(r[1]) / 1000
            RoundedRectangle(cornerRadius: 5)
                .fill(shown ? Color.yellow.opacity(0.38) : Color.clear)
                .frame(width: w, height: h)
                .contentShape(Rectangle())
                .offset(x: x, y: y)
                .onTapGesture(coordinateSpace: .global) { point in onAyah(id, point) }
                .accessibilityAddTraits(.isButton)
        }
    }
}
