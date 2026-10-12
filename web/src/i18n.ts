import { computed } from '@preact/signals'
import type { Surah } from './data'
import { settings } from './store'

export type Lang = 'fa' | 'en'

export const lang = computed<Lang>(() => {
  const l = settings.value.lang
  if (l !== 'auto') return l
  return (navigator.language || 'en').slice(0, 2) === 'fa' ? 'fa' : 'en'
})

const strings = {
  en: {
    appName: 'Zekr',
    navHome: 'Home',
    navIndex: 'Index',
    navSearch: 'Search',
    navBookmarks: 'Saved',
    navSettings: 'Settings',
    ayahOfTheDay: 'Ayah of the day',
    ayahOfTheHour: 'Ayah of the hour',
    nextChange: 'Changes in {time}',
    continueReading: 'Continue reading',
    startReading: 'Start with Al-Fatiha',
    surahs: 'Surahs',
    juz: 'Juz',
    juzN: 'Juz {n}',
    ayahCount: '{n} ayahs',
    meccan: 'Meccan',
    medinan: 'Medinan',
    filterSurahs: 'Filter surahs…',
    surahN: 'Surah {name}',
    ayahN: 'Ayah {n}',
    playSurah: 'Play surah',
    play: 'Play',
    pause: 'Pause',
    next: 'Next ayah',
    previous: 'Previous ayah',
    stop: 'Stop',
    bookmark: 'Save ayah',
    unbookmark: 'Remove from saved',
    copy: 'Copy',
    copied: 'Copied',
    share: 'Share',
    openInReader: 'Open in reader',
    searchPlaceholder: 'Search Arabic, Persian or English…',
    searchHint: 'Search the Arabic text and the translations you have selected.',
    noResults: 'Nothing found.',
    results: '{n} results',
    resultsMore: 'First {n} results shown',
    searching: 'Searching…',
    savedEmpty: 'Nothing saved yet. Tap the bookmark on any ayah.',
    saved: 'Saved ayahs',
    settings: 'Settings',
    language: 'Language',
    langAuto: 'Automatic',
    theme: 'Theme',
    themeAuto: 'Automatic',
    themeLight: 'Light',
    themeSepia: 'Sepia',
    themeDark: 'Dark',
    script: 'Arabic script',
    scriptUthmani: 'Uthmani',
    scriptSimple: 'Simple',
    arabicSize: 'Arabic size',
    trSize: 'Translation size',
    translations: 'Translations',
    translationsHint: 'Shown under each ayah, in this order.',
    persian: 'Persian',
    english: 'English',
    recitation: 'Recitation',
    reciter: 'Reciter',
    speed: 'Speed',
    repeat: 'Repeat each ayah',
    times: '{n}×',
    playTo: 'Keep playing until the end of',
    toAyah: 'the ayah',
    toPage: 'the page',
    toSurah: 'the surah',
    toJuz: 'the juz',
    toRub: 'the hizb quarter',
    toQuran: 'the Quran',
    audioTranslation: 'Translation audio after each ayah',
    off: 'Off',
    autoScroll: 'Scroll along while playing',
    offline: 'Offline use',
    offlineHint: 'Download all text and translations so the app works without internet. Recitation is streamed.',
    downloadAll: 'Download for offline',
    downloading: 'Downloading {done}/{total}…',
    downloaded: 'Ready for offline use',
    downloadFailed: 'Download failed. Check your connection and try again.',
    about: 'About and credits',
    loading: 'Loading…',
    loadFailed: 'Could not load the data. Check your connection.',
    retry: 'Try again',
    audioError: 'Could not play this recording.',
    mergedTranslation: '(translated together with the previous ayah)',
    dailyTitle: 'Ayah of the day',
    dailyHelp:
      'The same rule as the iPhone widget: with the same options, they show the same ayah at the same time.',
    changes: 'Changes',
    hourly: 'Every hour',
    every3h: 'Every 3 hours',
    daily: 'Every day',
    drawsFrom: 'Draws from',
    poolAll: 'All ayahs (long ones are trimmed)',
    poolFits: 'Ayahs that fit in full',
    shows: 'Shows',
    showFa: 'Arabic + Persian',
    showEn: 'Arabic + English',
    showBoth: 'Arabic + Persian + English',
    showAr: 'Arabic only',
    persianTranslation: 'Persian translation',
    englishTranslation: 'English translation',
    upcoming: 'Coming up',
    widgetPreview: 'Lock Screen widget preview',
    pool: 'pool',
    poolSize: '{n} ayahs in the pool',
    aboutText:
      'Zekr is a personal Quran app. It has no account, no ads and no tracking; your settings and saved ayahs stay in this browser.',
    creditsText:
      'Quran text and translations: Tanzil Project (tanzil.net). The text is unchanged; translations are for non-commercial use. Recitation: EveryAyah.com. Fonts: Amiri Quran and Vazirmatn (SIL Open Font License).',
    now: 'now',
    min: '{n} min',
    hours: '{n} h',
    install: 'Tip: add this page to your Home Screen to use it like an app.',
  },
  fa: {
    appName: 'ذکر',
    navHome: 'خانه',
    navIndex: 'فهرست',
    navSearch: 'جستجو',
    navBookmarks: 'نشان‌شده',
    navSettings: 'تنظیمات',
    ayahOfTheDay: 'آیهٔ روز',
    ayahOfTheHour: 'آیهٔ این ساعت',
    nextChange: 'تغییر در {time}',
    continueReading: 'ادامهٔ مطالعه',
    startReading: 'شروع با سورهٔ فاتحه',
    surahs: 'سوره‌ها',
    juz: 'جزء',
    juzN: 'جزء {n}',
    ayahCount: '{n} آیه',
    meccan: 'مکی',
    medinan: 'مدنی',
    filterSurahs: 'جستجو در سوره‌ها…',
    surahN: 'سورهٔ {name}',
    ayahN: 'آیهٔ {n}',
    playSurah: 'پخش سوره',
    play: 'پخش',
    pause: 'توقف',
    next: 'آیهٔ بعد',
    previous: 'آیهٔ قبل',
    stop: 'بستن',
    bookmark: 'نشان‌کردن آیه',
    unbookmark: 'حذف از نشان‌شده‌ها',
    copy: 'رونوشت',
    copied: 'کپی شد',
    share: 'اشتراک‌گذاری',
    openInReader: 'باز کردن در قرآن',
    searchPlaceholder: 'جستجو در متن عربی، فارسی یا انگلیسی…',
    searchHint: 'در متن عربی و ترجمه‌هایی که انتخاب کرده‌اید جستجو می‌شود.',
    noResults: 'چیزی پیدا نشد.',
    results: '{n} نتیجه',
    resultsMore: '{n} نتیجهٔ اول نمایش داده شد',
    searching: 'در حال جستجو…',
    savedEmpty: 'هنوز آیه‌ای نشان نکرده‌اید. روی نشان کنار هر آیه بزنید.',
    saved: 'آیه‌های نشان‌شده',
    settings: 'تنظیمات',
    language: 'زبان',
    langAuto: 'خودکار',
    theme: 'پوسته',
    themeAuto: 'خودکار',
    themeLight: 'روشن',
    themeSepia: 'کاغذی',
    themeDark: 'تیره',
    script: 'خط عربی',
    scriptUthmani: 'عثمانی',
    scriptSimple: 'ساده',
    arabicSize: 'اندازهٔ متن عربی',
    trSize: 'اندازهٔ ترجمه',
    translations: 'ترجمه‌ها',
    translationsHint: 'زیر هر آیه، به همین ترتیب نمایش داده می‌شوند.',
    persian: 'فارسی',
    english: 'انگلیسی',
    recitation: 'قرائت',
    reciter: 'قاری',
    speed: 'سرعت',
    repeat: 'تکرار هر آیه',
    times: '{n} بار',
    playTo: 'ادامهٔ پخش تا آخر',
    toAyah: 'آیه',
    toPage: 'صفحه',
    toSurah: 'سوره',
    toJuz: 'جزء',
    toRub: 'ربع حزب',
    toQuran: 'قرآن',
    audioTranslation: 'پخش ترجمهٔ گویا بعد از هر آیه',
    off: 'خاموش',
    autoScroll: 'همراه با پخش پایین برو',
    offline: 'استفاده بدون اینترنت',
    offlineHint: 'همهٔ متن‌ها و ترجمه‌ها را دانلود کنید تا بدون اینترنت کار کند. قرائت از اینترنت پخش می‌شود.',
    downloadAll: 'دانلود برای استفاده آفلاین',
    downloading: 'در حال دانلود {done}/{total}…',
    downloaded: 'آمادهٔ استفادهٔ آفلاین',
    downloadFailed: 'دانلود ناموفق بود. اتصال را بررسی و دوباره تلاش کنید.',
    about: 'دربارهٔ برنامه و منابع',
    loading: 'در حال بارگذاری…',
    loadFailed: 'داده‌ها بارگذاری نشد. اتصال اینترنت را بررسی کنید.',
    retry: 'تلاش دوباره',
    audioError: 'پخش این فایل صوتی ممکن نشد.',
    mergedTranslation: '(ترجمهٔ این آیه همراه آیهٔ قبل آمده است)',
    dailyTitle: 'آیهٔ روز',
    dailyHelp: 'همان قاعدهٔ ویجت آیفون: با تنظیمات یکسان، در هر لحظه هر دو یک آیه را نشان می‌دهند.',
    changes: 'تغییر',
    hourly: 'هر ساعت',
    every3h: 'هر ۳ ساعت',
    daily: 'هر روز',
    drawsFrom: 'انتخاب از',
    poolAll: 'همهٔ آیه‌ها (آیه‌های بلند کوتاه می‌شوند)',
    poolFits: 'آیه‌هایی که کامل جا می‌شوند',
    shows: 'نمایش',
    showFa: 'عربی + فارسی',
    showEn: 'عربی + انگلیسی',
    showBoth: 'عربی + فارسی + انگلیسی',
    showAr: 'فقط عربی',
    persianTranslation: 'ترجمهٔ فارسی',
    englishTranslation: 'ترجمهٔ انگلیسی',
    upcoming: 'آیه‌های بعدی',
    widgetPreview: 'پیش‌نمایش ویجت صفحهٔ قفل',
    pool: 'مجموعه',
    poolSize: '{n} آیه در مجموعه',
    aboutText:
      'ذکر یک برنامهٔ شخصی قرآن است. حساب کاربری، تبلیغ و ردیابی ندارد؛ تنظیمات و آیه‌های نشان‌شده فقط در همین مرورگر می‌مانند.',
    creditsText:
      'متن قرآن و ترجمه‌ها: پروژهٔ تنزیل (tanzil.net). متن بدون تغییر است و ترجمه‌ها برای استفادهٔ غیرتجاری‌اند. قرائت: EveryAyah.com. قلم‌ها: امیری قرآن و وزیرمتن (مجوز SIL Open Font License).',
    now: 'اکنون',
    min: '{n} دقیقه',
    hours: '{n} ساعت',
    install: 'نکته: این صفحه را به صفحهٔ اصلی گوشی اضافه کنید تا مثل یک برنامه باز شود.',
  },
} as const

export type Key = keyof (typeof strings)['en']

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s: string = strings[lang.value][key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, typeof v === 'number' ? num(v) : v)
  return s
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Digits in the UI language (Persian digits when the UI is Persian). */
export function num(n: number | string): string {
  const s = String(n)
  return lang.value === 'fa' ? s.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] as string) : s
}

export function surahName(s: Surah): string {
  return lang.value === 'fa' ? s.fa : s.tr
}

export function surahSubtitle(s: Surah): string {
  return lang.value === 'fa' ? s.tr : s.en
}

/** "Surah Al-Isra, 17:24" in the UI language. */
export function ayahRef(s: Surah, ayah: number): string {
  return `${t('surahN', { name: surahName(s) })} · ${num(s.id)}:${num(ayah)}`
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000))
  return minutes < 60 ? t('min', { n: minutes }) : t('hours', { n: Math.round(minutes / 60) })
}
