import Foundation

/// Recitations from EveryAyah.com: one MP3 per ayah at `https://everyayah.com/data/<folder>/<SSS><AAA>.mp3`.
public struct Reciter: Hashable, Sendable {
    public let id: String
    public let folder: String
    public let nameFarsi: String
    public let nameEnglish: String

    public func name(language: String) -> String { language == "fa" ? nameFarsi : nameEnglish }

    public func url(surah: Int, ayah: Int) -> URL { Reciter.audioURL(folder: folder, surah: surah, ayah: ayah) }

    public static func audioURL(folder: String, surah: Int, ayah: Int) -> URL {
        let s = String(format: "%03d", surah)
        let a = String(format: "%03d", ayah)
        return URL(string: "https://everyayah.com/data/\(folder)/\(s)\(a).mp3")!
    }

    /// The default reciter, Al-Minshawi (Murattal).
    public static let minshawi = Reciter(id: "minshawi-murattal", folder: "Minshawy_Murattal_128kbps", nameFarsi: "منشاوی (ترتیل)", nameEnglish: "Al-Minshawi (Murattal)")

    public static let all: [Reciter] = [
        minshawi,
        Reciter(id: "minshawi-mujawwad", folder: "Minshawy_Mujawwad_192kbps", nameFarsi: "منشاوی (تجوید)", nameEnglish: "Al-Minshawi (Mujawwad)"),
        Reciter(id: "husary", folder: "Husary_128kbps", nameFarsi: "حصری", nameEnglish: "Al-Husary"),
        Reciter(id: "abdulbasit-murattal", folder: "Abdul_Basit_Murattal_192kbps", nameFarsi: "عبدالباسط (ترتیل)", nameEnglish: "Abdul Basit (Murattal)"),
        Reciter(id: "abdulbasit-mujawwad", folder: "Abdul_Basit_Mujawwad_128kbps", nameFarsi: "عبدالباسط (تجوید)", nameEnglish: "Abdul Basit (Mujawwad)"),
        Reciter(id: "tablawi", folder: "Mohammad_al_Tablaway_128kbps", nameFarsi: "محمد الطبلاوی", nameEnglish: "Mohammad al-Tablawi"),
        Reciter(id: "parhizgar", folder: "Parhizgar_48kbps", nameFarsi: "پرهیزگار", nameEnglish: "Parhizgar"),
        Reciter(id: "mansoori", folder: "Karim_Mansoori_40kbps", nameFarsi: "کریم منصوری", nameEnglish: "Karim Mansoori"),
        Reciter(id: "alafasy", folder: "Alafasy_128kbps", nameFarsi: "مشاری العفاسی", nameEnglish: "Mishary Alafasy"),
    ]
}
