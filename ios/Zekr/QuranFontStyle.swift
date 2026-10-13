import SwiftUI
import ZekrKit

extension Font {
    /// Quran text in the font chosen in Settings, sized so each font looks about as big as the others.
    static func quran(_ font: QuranFont, size: Double) -> Font {
        .custom(font.postScriptName, size: size * font.scale)
    }
}
