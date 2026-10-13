import Foundation

/// App strings in Persian and English (the app follows the device language).
public enum Str: CaseIterable {
    case appName
    case ayahOfTheDay
    case ayahNotFound
    case couldNotLoad
    case play
    case pause
    case translation
    case addWidgetTitle
    case addWidgetSteps
    case widgetNote
    case tabToday
    case tabQuran
    case tabSaved
    case tabSettings
    case surahs
    case juz
    case filterSurahs
    case meccan
    case medinan
    case playSurah
    case bookmark
    case removeBookmark
    case share
    case copy
    case savedTitle
    case savedEmpty
    case settingsTitle
    case translations
    case translationsHint
    case reading
    case script
    case scriptUthmani
    case scriptSimple
    case quranFont
    case arabicSize
    case translationSize
    case recitation
    case reciter
    case speed
    case repeatEach
    case playTo
    case toAyah
    case toPage
    case toSurah
    case toJuz
    case toRub
    case toQuran
    case audioTranslation
    case off
    case about
    case credits
    case mergedTranslation
    case audioError
    case translationAudio
    case readingView
    case viewVerseFull
    case viewPageFull
    case goToPage
    case goTo
    case cancel
    case close
    case tapAyah
    case nextPage
    case prevPage
    case playFromPage
    case menu
    case pageBox
    case pageBoxBottom
    case pageBoxPopup
    case followRecitation
    case tafsir
    case almizan
    case tafsirParts
    case sources
    case almizanCredit

    public func text(language: String) -> String {
        language == "fa" ? fa : en
    }

    public var text: String { text(language: LocalizedText.deviceLanguage) }

    private var en: String {
        switch self {
        case .appName: return "Zekr"
        case .ayahOfTheDay: return "Ayah of the day"
        case .ayahNotFound: return "This ayah could not be found."
        case .couldNotLoad: return "Could not load the Quran data."
        case .play: return "Play"
        case .pause: return "Pause"
        case .translation: return "Translation"
        case .addWidgetTitle: return "Add the Lock Screen widget"
        case .addWidgetSteps:
            return "1. Touch and hold the Lock Screen, then tap Customize.\n2. Choose Lock Screen and tap the widget area.\n3. Search for Zekr and add “Ayah”.\n4. Tap the widget, then Edit Widget, to choose how often it changes and what it shows."
        case .widgetNote: return "It uses the same rule as the web version, so both show the same ayah with the same options."
        case .tabToday: return "Today"
        case .tabQuran: return "Quran"
        case .tabSaved: return "Saved"
        case .tabSettings: return "Settings"
        case .surahs: return "Surahs"
        case .juz: return "Juz"
        case .filterSurahs: return "Filter surahs"
        case .meccan: return "Meccan"
        case .medinan: return "Medinan"
        case .playSurah: return "Play surah"
        case .bookmark: return "Save ayah"
        case .removeBookmark: return "Remove from saved"
        case .share: return "Share"
        case .copy: return "Copy"
        case .savedTitle: return "Saved ayahs"
        case .savedEmpty: return "Nothing saved yet. Tap the bookmark on any ayah."
        case .settingsTitle: return "Settings"
        case .translations: return "Translations"
        case .translationsHint: return "Shown under each ayah, in the order you choose them."
        case .reading: return "Reading"
        case .script: return "Arabic script"
        case .scriptUthmani: return "Uthmani"
        case .scriptSimple: return "Simple"
        case .quranFont: return "Quran font"
        case .arabicSize: return "Arabic size"
        case .translationSize: return "Translation size"
        case .recitation: return "Recitation"
        case .reciter: return "Reciter"
        case .speed: return "Speed"
        case .repeatEach: return "Repeat each ayah"
        case .playTo: return "Keep playing until the end of"
        case .toAyah: return "the ayah"
        case .toPage: return "the page"
        case .toSurah: return "the surah"
        case .toJuz: return "the juz"
        case .toRub: return "the hizb quarter"
        case .toQuran: return "the Quran"
        case .audioTranslation: return "Translation audio after each ayah"
        case .off: return "Off"
        case .about: return "About"
        case .credits: return "Quran text and translations: Tanzil Project (tanzil.net). The text is unchanged; translations are for non-commercial use. Recitation: EveryAyah.com. Fonts: KFGQPC Hafs and Naskh (King Fahd Complex), Me-Quran (Meor Ridzuan), Scheherazade New and Amiri Quran (SIL Open Font License)."
        case .mergedTranslation: return "(translated together with the previous ayah)"
        case .audioError: return "Could not play this recording."
        case .translationAudio: return "Translation audio"
        case .readingView: return "Reading view"
        case .viewVerseFull: return "Verse by verse, with translations"
        case .viewPageFull: return "Mushaf page"
        case .goToPage: return "Go to page"
        case .goTo: return "Go"
        case .cancel: return "Cancel"
        case .close: return "Close"
        case .tapAyah: return "Tap an ayah for its translation, or the page for reading options."
        case .nextPage: return "Next page"
        case .prevPage: return "Previous page"
        case .playFromPage: return "Play from this page"
        case .menu: return "Menu"
        case .pageBox: return "Translation on the page"
        case .pageBoxBottom: return "In a box at the bottom"
        case .pageBoxPopup: return "In a card over the page"
        case .followRecitation: return "Follow the recitation (show the ayah being recited)"
        case .tafsir: return "Tafsir"
        case .almizan: return "Al-Mizan"
        case .tafsirParts: return "Go to part"
        case .sources: return "Sources"
        case .almizanCredit: return "Al-Mizan by Allameh Tabatabaei, Persian translation by Mousavi Hamadani. Text from the Zolal project (CRCIS Noor), for personal use."
        }
    }

    private var fa: String {
        switch self {
        case .appName: return "ذکر"
        case .ayahOfTheDay: return "آیهٔ روز"
        case .ayahNotFound: return "این آیه پیدا نشد."
        case .couldNotLoad: return "بارگذاری داده‌های قرآن ممکن نشد."
        case .play: return "پخش"
        case .pause: return "توقف"
        case .translation: return "ترجمه"
        case .addWidgetTitle: return "افزودن ویجت صفحهٔ قفل"
        case .addWidgetSteps:
            return "۱. روی صفحهٔ قفل نگه دارید و «سفارشی‌سازی» را بزنید.\n۲. «صفحهٔ قفل» را انتخاب و روی بخش ویجت‌ها بزنید.\n۳. «Zekr» را جستجو و «Ayah» را اضافه کنید.\n۴. روی ویجت بزنید و «ویرایش ویجت» را انتخاب کنید تا هر چند وقت یک‌بار عوض شود و چه چیزی نشان دهد."
        case .widgetNote: return "این ویجت همان قاعدهٔ نسخهٔ وب را دارد؛ با تنظیمات یکسان، هر دو یک آیه را نشان می‌دهند."
        case .tabToday: return "امروز"
        case .tabQuran: return "قرآن"
        case .tabSaved: return "نشان‌شده"
        case .tabSettings: return "تنظیمات"
        case .surahs: return "سوره‌ها"
        case .juz: return "جزء"
        case .filterSurahs: return "جستجو در سوره‌ها"
        case .meccan: return "مکی"
        case .medinan: return "مدنی"
        case .playSurah: return "پخش سوره"
        case .bookmark: return "نشان‌کردن آیه"
        case .removeBookmark: return "حذف از نشان‌شده‌ها"
        case .share: return "اشتراک‌گذاری"
        case .copy: return "رونوشت"
        case .savedTitle: return "آیه‌های نشان‌شده"
        case .savedEmpty: return "هنوز آیه‌ای نشان نکرده‌اید. روی نشان کنار هر آیه بزنید."
        case .settingsTitle: return "تنظیمات"
        case .translations: return "ترجمه‌ها"
        case .translationsHint: return "زیر هر آیه، به ترتیبی که انتخاب می‌کنید نمایش داده می‌شوند."
        case .reading: return "مطالعه"
        case .script: return "خط عربی"
        case .scriptUthmani: return "عثمانی"
        case .scriptSimple: return "ساده"
        case .quranFont: return "قلم قرآن"
        case .arabicSize: return "اندازهٔ متن عربی"
        case .translationSize: return "اندازهٔ ترجمه"
        case .recitation: return "قرائت"
        case .reciter: return "قاری"
        case .speed: return "سرعت"
        case .repeatEach: return "تکرار هر آیه"
        case .playTo: return "ادامهٔ پخش تا آخر"
        case .toAyah: return "آیه"
        case .toPage: return "صفحه"
        case .toSurah: return "سوره"
        case .toJuz: return "جزء"
        case .toRub: return "ربع حزب"
        case .toQuran: return "قرآن"
        case .audioTranslation: return "پخش ترجمهٔ گویا بعد از هر آیه"
        case .off: return "خاموش"
        case .about: return "دربارهٔ برنامه"
        case .credits: return "متن قرآن و ترجمه‌ها: پروژهٔ تنزیل (tanzil.net). متن بدون تغییر است و ترجمه‌ها برای استفادهٔ غیرتجاری‌اند. قرائت: EveryAyah.com. قلم‌ها: حفص و نسخ مجمع ملک فهد، می‌قرآن (معیر رضوان)، شهرزاد و امیری قرآن (مجوز SIL Open Font License)."
        case .mergedTranslation: return "(ترجمهٔ این آیه همراه آیهٔ قبل آمده است)"
        case .audioError: return "پخش این فایل صوتی ممکن نشد."
        case .translationAudio: return "ترجمهٔ گویا"
        case .readingView: return "نحوهٔ نمایش قرآن"
        case .viewVerseFull: return "آیه‌به‌آیه، با ترجمه"
        case .viewPageFull: return "صفحهٔ قرآن"
        case .goToPage: return "رفتن به صفحه"
        case .goTo: return "برو"
        case .cancel: return "انصراف"
        case .close: return "بستن"
        case .tapAyah: return "برای ترجمه روی یک آیه بزنید، و برای تنظیمات خواندن روی صفحه."
        case .nextPage: return "صفحهٔ بعد"
        case .prevPage: return "صفحهٔ قبل"
        case .playFromPage: return "پخش از این صفحه"
        case .menu: return "منو"
        case .pageBox: return "ترجمه در صفحه"
        case .pageBoxBottom: return "در کادری در پایین"
        case .pageBoxPopup: return "در کارتی روی صفحه"
        case .followRecitation: return "همراهی با قرائت (نمایش آیه‌ای که خوانده می‌شود)"
        case .tafsir: return "تفسیر"
        case .almizan: return "المیزان"
        case .tafsirParts: return "رفتن به بخش"
        case .sources: return "منابع"
        case .almizanCredit: return "تفسیر المیزان، علامه طباطبایی، ترجمهٔ سید محمدباقر موسوی همدانی. متن از پروژهٔ زلال (مرکز نور)، برای استفادهٔ شخصی."
        }
    }
}
