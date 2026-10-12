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
        }
    }
}
