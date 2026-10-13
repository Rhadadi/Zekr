/** One end of the surah header: a fine line ending in a diamond, a leaf and a gold rosette (drawn for Zekr). */
function Ornament({ flip }: { flip?: boolean }) {
  return (
    <svg class={`orn${flip ? ' flip' : ''}`} viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      <path d="M2 24H20" class="orn-line" />
      <path d="M3 24l4-4 4 4-4 4z" class="orn-fill" />
      <path d="M18 24C26 10 40 7 54 13 45 18 45 30 54 35 40 41 26 38 18 24Z" class="orn-line" />
      <path d="M25 24C31 16 40 14 47 17 42 21 42 27 47 31 40 34 31 32 25 24Z" class="orn-soft" />
      <g class="orn-flower">
        <circle cx="54" cy="18" r="3.4" />
        <circle cx="59.2" cy="21" r="3.4" />
        <circle cx="59.2" cy="27" r="3.4" />
        <circle cx="54" cy="30" r="3.4" />
        <circle cx="48.8" cy="27" r="3.4" />
        <circle cx="48.8" cy="21" r="3.4" />
      </g>
      <circle cx="54" cy="24" r="2.6" class="orn-heart" />
    </svg>
  )
}

/** The header at the start of a surah: its name in a double frame between two ornaments. */
export function SurahBanner({ name, level = 2 }: { name: string; level?: 1 | 2 }) {
  return (
    // laid out left to right, so the ornaments point outward whatever the page direction
    <div class="banner" role="heading" aria-level={level} dir="ltr">
      <Ornament />
      <span class="banner-frame"><span class="banner-name" lang="ar" dir="rtl">سورة {name}</span></span>
      <Ornament flip />
    </div>
  )
}
