const stroked = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  list: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  close: 'M6 6l12 12M18 6L6 18',
  copy: 'M9 9h11v12H9zM5 15V3h11',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v8h14v-8',
  chevron: 'M9 6l6 6-6 6',
  sliders: 'M4 6h16M7 12h10M10 18h4',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  speech: 'M4 5h16v11H10l-5 4v-4H4zM8 9h8M8 12h5',
} as const

const filled = {
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  next: 'M5 4l10 8-10 8zM17 4h2v16h-2z',
  prev: 'M19 4L9 12l10 8zM5 4h2v16H5z',
  bookmarkFilled: 'M6 3h12v18l-6-4-6 4z',
} as const

export type IconName = keyof typeof stroked | keyof typeof filled

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const solid = name in filled
  const d = solid ? filled[name as keyof typeof filled] : stroked[name as keyof typeof stroked]
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={d} />
    </svg>
  )
}
