// Recitations and translation recordings from EveryAyah.com: one MP3 per ayah at
// https://everyayah.com/data/<folder>/<surah 3 digits><ayah 3 digits>.mp3
// Every folder below was checked to have 1:1 (the basmala), 17:24 and 114:6.

export interface Reciter {
  id: string
  folder: string
  fa: string
  en: string
}

export const reciters: Reciter[] = [
  { id: 'minshawi-murattal', folder: 'Minshawy_Murattal_128kbps', fa: 'منشاوی (ترتیل)', en: 'Al-Minshawi (Murattal)' },
  { id: 'minshawi-mujawwad', folder: 'Minshawy_Mujawwad_192kbps', fa: 'منشاوی (تجوید)', en: 'Al-Minshawi (Mujawwad)' },
  { id: 'husary', folder: 'Husary_128kbps', fa: 'حصری', en: 'Al-Husary' },
  { id: 'husary-mujawwad', folder: 'Husary_128kbps_Mujawwad', fa: 'حصری (تجوید)', en: 'Al-Husary (Mujawwad)' },
  { id: 'husary-muallim', folder: 'Husary_Muallim_128kbps', fa: 'حصری (معلّم)', en: 'Al-Husary (Muallim, teaching)' },
  { id: 'abdulbasit-murattal', folder: 'Abdul_Basit_Murattal_192kbps', fa: 'عبدالباسط (ترتیل)', en: 'Abdul Basit (Murattal)' },
  { id: 'abdulbasit-mujawwad', folder: 'Abdul_Basit_Mujawwad_128kbps', fa: 'عبدالباسط (تجوید)', en: 'Abdul Basit (Mujawwad)' },
  { id: 'tablawi', folder: 'Mohammad_al_Tablaway_128kbps', fa: 'محمد الطبلاوی', en: 'Mohammad al-Tablawi' },
  { id: 'parhizgar', folder: 'Parhizgar_48kbps', fa: 'پرهیزگار', en: 'Parhizgar' },
  { id: 'mansoori', folder: 'Karim_Mansoori_40kbps', fa: 'کریم منصوری', en: 'Karim Mansoori' },
  { id: 'alafasy', folder: 'Alafasy_128kbps', fa: 'مشاری العفاسی', en: 'Mishary Alafasy' },
  { id: 'sudais', folder: 'Abdurrahmaan_As-Sudais_192kbps', fa: 'السدیس', en: 'Abdurrahman As-Sudais' },
  { id: 'shuraym', folder: 'Saood_ash-Shuraym_128kbps', fa: 'الشریم', en: 'Saud Ash-Shuraym' },
  { id: 'maher', folder: 'MaherAlMuaiqly128kbps', fa: 'ماهر المعیقلی', en: 'Maher Al-Muaiqly' },
  { id: 'ghamadi', folder: 'Ghamadi_40kbps', fa: 'سعد الغامدی', en: 'Saad Al-Ghamdi' },
  { id: 'hudhaify', folder: 'Hudhaify_128kbps', fa: 'الحذیفی', en: 'Ali Al-Hudhaify' },
  { id: 'basfar', folder: 'Abdullah_Basfar_192kbps', fa: 'عبدالله بصفر', en: 'Abdullah Basfar' },
  { id: 'ajamy', folder: 'ahmed_ibn_ali_al_ajamy_128kbps', fa: 'احمد العجمی', en: 'Ahmed Al-Ajamy' },
  { id: 'rifai', folder: 'Hani_Rifai_192kbps', fa: 'هانی الرفاعی', en: 'Hani Ar-Rifai' },
  { id: 'budair', folder: 'Salah_Al_Budair_128kbps', fa: 'صلاح البدیر', en: 'Salah Al-Budair' },
  { id: 'shaatree', folder: 'Abu_Bakr_Ash-Shaatree_128kbps', fa: 'ابوبکر الشاطری', en: 'Abu Bakr Ash-Shaatree' },
  { id: 'ayyoub', folder: 'Muhammad_Ayyoub_128kbps', fa: 'محمد ایوب', en: 'Muhammad Ayyoub' },
  { id: 'jibreel', folder: 'Muhammad_Jibreel_128kbps', fa: 'محمد جبریل', en: 'Muhammad Jibreel' },
  { id: 'sowaid', folder: 'Ayman_Sowaid_64kbps', fa: 'ایمن سویّد', en: 'Ayman Sowaid' },
]

export const defaultReciter = reciters[0] as Reciter

export interface AudioTranslation {
  id: string
  folder: string
  fa: string
  en: string
}

/** Recorded translations that can play after each ayah. */
export const audioTranslations: AudioTranslation[] = [
  { id: 'fa.fooladvand', folder: 'translations/Fooladvand_Hedayatfar_40Kbps', fa: 'فولادوند (هدایت‌فر)', en: 'Persian: Fooladvand, read by Hedayatfar' },
  { id: 'fa.makarem', folder: 'translations/Makarem_Kabiri_16Kbps', fa: 'مکارم (کبیری)', en: 'Persian: Makarem, read by Kabiri' },
  { id: 'en.sahih', folder: 'English/Sahih_Intnl_Ibrahim_Walk_192kbps', fa: 'انگلیسی: صحیح اینترنشنال (ابراهیم واک)', en: 'English: Saheeh International, read by Ibrahim Walk' },
]

export function reciterById(id: string): Reciter {
  return reciters.find((r) => r.id === id) ?? defaultReciter
}

const pad3 = (n: number) => String(n).padStart(3, '0')

export function audioUrl(folder: string, surah: number, ayah: number): string {
  return `https://everyayah.com/data/${folder}/${pad3(surah)}${pad3(ayah)}.mp3`
}
