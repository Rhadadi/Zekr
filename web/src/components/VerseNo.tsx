// One outline for the whole frame (ring and crests), its hole dipping where each crest meets the ring, as in the owner's drawing
const FRAME =
  'M50 2C53 9 56 14 63 18C72 22 86 20 98 26C95 31 91 34 88.6 40' +
  'A46 46 0 0 1 88.6 90C91 96 95 99 98 104C86 110 72 108 63 112C56 116 53 121 50 128' +
  'C47 121 44 116 37 112C28 108 14 110 2 104C5 99 9 96 11.4 90' +
  'A46 46 0 0 1 11.4 40C9 34 5 31 2 26C14 20 28 22 37 18C44 14 47 9 50 2Z' +
  'M13.2 48C17 38 27 32 36 32C43 32 47 35 50 39C53 35 57 32 64 32C73 32 83 38 86.8 48' +
  'A40.5 40.5 0 0 1 86.8 82C83 92 73 98 64 98C57 98 53 95 50 91C47 95 43 98 36 98C27 98 17 92 13.2 82' +
  'A40.5 40.5 0 0 1 13.2 48Z'

/** An ayah's number in an ornamental frame (the owner's design): a ring with a pointed crest above and below, each with
 * a dot and two strokes. Drawn, not a picture, so it is sharp at any size; its colours come from the CSS (.vno). */
export function VerseNo({ n }: { n: string }) {
  return (
    <span class="vno">
      <svg viewBox="0 0 100 130" aria-hidden="true" focusable="false">
        <path class="vno-frame" fill-rule="evenodd" d={FRAME} />
        <g class="vno-ink">
          <circle cx="50" cy="21" r="3.8" />
          <circle cx="50" cy="109" r="3.8" />
          <path d="M23 28L35 25M65 25L77 28M23 102L35 105M65 105L77 102" />
        </g>
      </svg>
      <span class={`vno-n${/^[0-9]+$/.test(n) ? ' latin' : ''}`}>{n}</span>
    </span>
  )
}
