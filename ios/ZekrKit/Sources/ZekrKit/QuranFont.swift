import Foundation

/// Arabic fonts for the Quran text, the same ones the web app offers (web/src/fonts.ts).
/// The files are in Zekr/Fonts and listed under UIAppFonts in project.yml; licenses in Zekr/Fonts/LICENSES.txt.
public struct QuranFont: Identifiable, Equatable, Sendable {
    public let id: String
    /// Shown in Settings; it is the font's own name, so the same in both languages.
    public let name: String
    /// The font's PostScript name, for `Font.custom`.
    public let postScriptName: String
    public let fileName: String
    /// Evens out the fonts' sizes, so the Arabic size setting looks about the same in each.
    public let scale: Double

    public static let hafs = QuranFont(id: "hafs", name: "KFGQPC Hafs", postScriptName: "KFGQPCHAFSUthmanicScript-Regula", fileName: "KFGQPC-Hafs.otf", scale: 1)
    public static let naskh = QuranFont(id: "naskh", name: "KFGQPC Naskh", postScriptName: "KFGQPCUthmanTahaNaskh", fileName: "KFGQPC-Naskh.otf", scale: 1)
    public static let meQuran = QuranFont(id: "meQuran", name: "Me-Quran", postScriptName: "me_quran", fileName: "MeQuran.otf", scale: 0.85)
    public static let scheherazade = QuranFont(id: "scheherazade", name: "Scheherazade", postScriptName: "ScheherazadeNew-Regular", fileName: "ScheherazadeNew-Regular.ttf", scale: 0.92)
    public static let amiri = QuranFont(id: "amiri", name: "Amiri Quran", postScriptName: "AmiriQuran-Regular", fileName: "AmiriQuran-Regular.ttf", scale: 1)

    public static let all: [QuranFont] = [.hafs, .naskh, .meQuran, .scheherazade, .amiri]

    /// The font with this id, or KFGQPC Hafs.
    public static func named(_ id: String) -> QuranFont { all.first { $0.id == id } ?? .hafs }
}
