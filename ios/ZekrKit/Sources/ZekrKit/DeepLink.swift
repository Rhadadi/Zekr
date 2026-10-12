import Foundation

/// `zekr://ayah/17/24` opens an ayah. Used by the widget, notifications and Shortcuts.
public enum DeepLink: Equatable {
    case ayah(surah: Int, ayah: Int)

    public static let scheme = "zekr"

    public init?(url: URL) {
        guard url.scheme == Self.scheme, url.host == "ayah" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, let surah = Int(parts[0]), let ayah = Int(parts[1]), (1...114).contains(surah), ayah >= 1 else {
            return nil
        }
        self = .ayah(surah: surah, ayah: ayah)
    }

    public var url: URL {
        switch self {
        case .ayah(let surah, let ayah): return URL(string: "\(Self.scheme)://ayah/\(surah)/\(ayah)")!
        }
    }
}
