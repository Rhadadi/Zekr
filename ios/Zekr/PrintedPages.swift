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
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .modifier(PageTint(color: model.settings.settings.pageColor))
                        .frame(width: geo.size.width, height: geo.size.height)
                        .contentShape(Rectangle())
                        .onTapGesture(perform: onPage)
                        .accessibilityLabel(LocalizedText.pageTitle(number, language: model.language))
                    ForEach(Array(entry.a.enumerated()), id: \.offset) { k, rects in
                        let id = entry.first + k
                        ForEach(Array(rects.enumerated()), id: \.offset) { j, r in
                            if r.count == 4 {
                                RoundedRectangle(cornerRadius: 5)
                                    .fill(id == highlighted ? Color.yellow.opacity(0.38) : Color.clear)
                                    .frame(width: geo.size.width * Double(r[2]) / 1000, height: geo.size.height * Double(r[3]) / 1000)
                                    .contentShape(Rectangle())
                                    .offset(x: geo.size.width * Double(r[0]) / 1000, y: geo.size.height * Double(r[1]) / 1000)
                                    .onTapGesture(coordinateSpace: .global) { onAyah(id, $0) }
                                    // each ayah is one element for VoiceOver (its first rectangle), with its text
                                    .accessibilityElement(children: .ignore)
                                    .accessibilityLabel(j == 0 ? ((try? model.store?.arabic(ayahID: id, script: model.settings.settings.script)) ?? "") : "")
                                    .accessibilityHidden(j != 0)
                                    .accessibilityAddTraits(.isButton)
                            }
                        }
                    }
                }
            }
            .aspectRatio(CGFloat(entry.w) / CGFloat(entry.h), contentMode: .fit)
            .padding(.bottom, 8)
        } else {
            Color.clear.frame(height: 400)
        }
    }
}
