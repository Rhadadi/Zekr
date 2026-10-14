# Zekr: navigation and layout redesign (the plan)

Status: **planned, not started.** Written October 14, 2026. Read `AGENTS.md` first for how to build, test and what is private.

This document is the contract for the next piece of work, for the web app and the iPhone app. A different agent (or person) should be able to pick it up and implement it step by step. Each step in §10 is small, testable and leaves the tests green.

## 1. Why

After several rounds of feedback the owner is still unhappy with the page layout. The problems, in their words and in order of importance:

1. Too many places to be. The reader jumps between a mushaf page, a "verse by verse" page, an index, Today, Saved and so on, and **has no obvious way back to the main reading page.** (They opened the burger menu, landed on a page with translations under each ayah, and could not tell how to go back.)
2. The bottom bar (Quran, Today, Search, Saved, Settings) wastes space and "Quran" is a pointless button when you are already reading the Quran. A small floating burger replaced it, but it still sends you to other screens.
3. When you tap an ayah on a desktop, the options a daily reciter needs (recitation, repeat, bookmark, and so on) are not obvious, and the translation box squeezes and reflows the text.
4. The owner wants the standard of Apple or Google: a design where a user always knows where they are and how to get back.

## 2. Decisions (fixed by the owner; do not reopen)

| # | Decision |
|---|---|
| D1 | **The mushaf is the only reading screen.** It scrolls continuously through all 604 pages. Everything else is a **layer** over it (a panel, sheet or overlay) that closes back to the exact same ayah and scroll position. |
| D2 | **Navigation is a side drawer** opened by a burger at the start of the top bar: Quran, Today, Search, Saved, Settings. There is no bottom bar. |
| D3 | **Desktop: tapping an ayah opens a left panel that stays open** (an inspector) with the ayah's actions and its translation. It follows the recitation. The text column never changes width. |
| D4 | **Phone: tapping an ayah opens a bottom sheet**, draggable to two heights and dismissable, with the same contents. |
| D5 | **Verse by verse stays, as a "Study view" layer** with a clear Close, not as a destination. |
| D6 | **Translation placement is a setting**: panel (the default: left panel on desktop, bottom sheet on phone), card over the ayah, inline under each ayah, or off. |
| D7 | The Study Quran and Al-Mizan text are private. They must never reach the public repository or the public website (see `AGENTS.md`). |

## 3. The model

There is exactly one screen: the mushaf. It mounts once and **never unmounts**. The URL says two independent things:

- a **base**: which mushaf page (optionally which ayah is selected);
- an optional **layer**: index, today, daily, search, saved, settings, about, study, commentary, intro, tafsir.

A layer is a fixed overlay inside `<main id="main">`. The mushaf keeps its scroll position because nothing about its layout changes while a layer is open. Browser Back closes the top layer. Close buttons and Escape do the same. A cold deep link into a layer still has a Close that lands on the mushaf, so nobody is ever stranded.

### Map (every screen, how you get in, how you get out)

```
Mushaf (home, always underneath)
 ├─ burger → Drawer: Quran · Today · Search · Saved · Settings
 │    ├─ Quran    → layer: surah / juz index; pick one → closes, mushaf jumps there
 │    ├─ Today    → layer: ayah of the day; "Open in the mushaf" → closes, jumps
 │    ├─ Search   → layer: results; pick one → closes, mushaf jumps, ayah selected
 │    ├─ Saved    → layer: saved ayahs; pick one → closes, mushaf jumps
 │    └─ Settings → layer; About is a section inside it
 ├─ tap an ayah → inspector (desktop) / bottom sheet (phone)
 │    ├─ Play from here · Repeat this ayah · Save · Copy · Share
 │    ├─ Tafsir (Al-Mizan, private builds)      → layer
 │    ├─ Commentary chips (Study Quran, private) → layer
 │    └─ Study view (verse by verse)             → layer
 ├─ tap the page number → jump to page (inline field)
 └─ options button in the bar → reading options (play from this page, Study view, All settings)

Every layer: [burger] [title] [Close ✕]. Close, Escape and Back all return to the mushaf.
```

### Why this follows the platform conventions

- **Apple**: a persistent inspector beside content (Split View / Inspector), sheets with detents and a grab handle, one navigation container with a leading control, content that stays put when a modal is dismissed.
- **Google (Material)**: a modal navigation drawer behind a leading burger, a bottom sheet with drag handle (standard type, not modal, so content stays usable), and "up/close always returns to where you were".

## 4. URL and router

Keep every existing path so deep links, `href` helpers and e2e URLs still work. Only the rendering changes.

```ts
export type Base = { page: number } | { surah: number; ayah?: number; select?: boolean }
export type LayerName = 'index' | 'today' | 'daily' | 'search' | 'saved' | 'settings' | 'about'
  | 'study' | 'commentary' | 'intro' | 'tafsir'
export interface Route { base?: Base; layer: { name: LayerName; surah?: number; ayah?: number } | null; query: URLSearchParams }
```

| hash | base | layer |
|---|---|---|
| `#/`, unknown | none (use last read) | none |
| `#/page/305` | page 305 | none |
| `#/surah/17`, `#/ayah/17/24` | that surah / ayah (selected) | none |
| `#/verse/17/24` | that ayah | `study` |
| `#/commentary/2/6`, `#/intro/2`, `#/tafsir/19/7` | that ayah | that layer |
| `#/index`, `#/today`, `#/daily`, `#/search?q=`, `#/saved`, `#/settings`, `#/about` | unchanged | that layer |

- `mushafAt` (a signal) holds the sticky base. A plain layer route does not change it, so closing a layer lands on the same ayah. Compare by value so the mushaf does not scroll when nothing changed.
- Delete `window.scrollTo(0, 0)` in `router.ts` (the `hashchange` handler). Layers mount fresh with their own scroll container (`position: fixed; inset: 0; overflow-y: auto; overscroll-behavior: contain`).
- `src/layers.ts`: `openLayer(hash)` counts pushed entries; `closeLayer()` does `history.back()` when it pushed, else sets the hash to the mushaf. One shared `LayerLink` keeps real `href`s (middle-click, copy link) while counting.
- While a layer is open: set `inert` on the mushaf container (never `aria-hidden`), pause the page-in-view tracker, and do not write "last read".
- The layer overlay renders **inside** `<main id="main">`; the drawer and backdrop render **outside** it (so `inert` on main cannot disable the drawer). The axe test depends on `main#main :is(article, .card, ul.list, .status, p, h2)` matching on every route.

## 5. The drawer

`Drawer.tsx` replaces `MainMenu.tsx` and the `.menu-pop*` CSS.

- A real dialog: `role="dialog" aria-modal="true"`, labelled; contains `<nav aria-label="Main">` with five `<a>` and `aria-current="page"`; focus moves to the first link on open and back to the burger on close; Tab cycles inside; Escape, backdrop click and link click close it; **Back closes it** through a shared `useBackDismiss` hook (one extra history entry for the same hash).
- Slides in from the **inline start** (right in Persian, left in English). Use logical properties; mirror only the transform for RTL.
- The burger lives in the app bar's start slot (a normal grid child, not a fixed floater).

## 6. The app bar

One component for the mushaf and every layer; `PageHeader` and the inline `.mushaf-bar` go away.

```
[ burger ] [ centre ........................ ] [ end ]
mushaf: surah name · page (tap to jump) · juz        [ options ⚙ ]
layer:  title (+ subtitle)                           [ Close ✕ ]
```

Keep the class names `.mb-surah`, `.mb-page`, `.mb-jump`, `.mb-juz` and the "Go to page" label (tests depend on them). Layers close; they do not navigate to a parent, so there is no `back` prop.

z-index ladder: inspector 1, app bar 5, card 6, layer 7, player 8, sheet 10, drawer backdrop/drawer 20/21, toast 30.

## 7. Ayah actions (the daily reciter)

One component, three presentations: `panel` (desktop inspector), `sheet` (phone), `card` (floating).

- **Head**: the ayah reference (`Surah An-Nisa · 4:1`).
- **Row 1, labelled 44px buttons**: **Play from here / Pause** (primary) and **Repeat this ayah** (`aria-pressed`).
- **Row 2, icon-only with `aria-label`**: Save, Copy, Share, Tafsir (only when the private tafsir exists), Open in Study view, Close.
- **Body**: the translation(s) when placement is `panel`, then the Study Quran chips.

**Repeat this ayah** needs no new playback engine: set the plan's repeat to infinity (`Number.POSITIVE_INFINITY` on the web, `Int.max` on iPhone). The playback code already loops while repeats remain. Turning it off re-plans instead of reloading, so the audio does not restart mid-word. The settings effect must preserve the infinite repeat while looping. Add it behind **More** in the Study view rows too.

### Desktop inspector (≥1000px)

Reserve the column, always. One CSS grid; no 1440px special case.

```css
@media (min-width: 1000px) {
  .reader { display: grid; grid-template-columns: var(--insp-w) minmax(0, 1fr); gap: 24px;
            max-width: calc(var(--insp-w) + 24px + 720px); margin-inline: auto; }
  .inspector { position: sticky; top: calc(var(--bar-h) + 8px); align-self: start; max-height: calc(100dvh - var(--bar-h) - var(--player-h) - 24px); overflow-y: auto; }
}
:root { --insp-w: clamp(300px, 26vw, 380px); }
```

The inspector is in flow and sticky, not `position: fixed`, so the text width depends on the viewport only and **never reflows**. Closed, it shows the one-line hint "Tap an ayah" and keeps its column. It sits at the inline start (the right in Persian).

### Phone sheet (<1000px)

`Sheet.tsx`: two detents (about 45dvh and 88dvh), dragged with Pointer Events (no dependency), `aria-modal="false"` so the mushaf stays usable. The grab handle is a real 44px `<button>` that toggles the detent (`aria-expanded`), so it is keyboard- and screen-reader-operable; Escape and Back close it. Do **not** pad the page for it (that is the jump the owner dislikes); give each ayah `scroll-margin-bottom: calc(var(--sheet-h) + 16px)` and use `scrollIntoView({ block: 'nearest' })`.

### Card and inline placements

- **card**: the existing hover/tap card under the ayah. Remove the hardcoded `70` ("the bottom bar") from its placement maths.
- **inline**: one paragraph per ayah followed by its translation. Justification is lost in this mode; say so in the option's hint. Build this last; it is the only genuinely new rendering.
- **off**: no translations on the page; tapping an ayah still opens the panel (it is the action surface).

## 8. Settings

```ts
export type TranslationPlace = 'panel' | 'card' | 'inline' | 'off'   // default 'panel'
```

- Remove `readMode` (the mushaf is the only reading screen) and `pageBox`.
- **Migrate** in `store.ts#loadSettings`: `pageBox: 'popup'` → `'card'`; any other `pageBox` → `'panel'`; ignore a stored `readMode`; do not write the old keys back. Mirror the same migration in `ReaderSettings.init(from:)` on iPhone.
- Reorder `Settings.tsx` to match the `Settings` interface: Language, Theme → Reading (translation placement, script, Quran font, Arabic size, translation size) → Translations → Recitation (including repeat and "follow the recitation") → Offline → About.
- `PageOptions` loses its four duplicated controls (Quran font, translation placement, follow recitation, Arabic size). Settings is one tap away through the drawer. It keeps: Play from this page, Open in Study view, All settings.

## 9. What to delete

- `src/components/MainMenu.tsx`, `PageHeader` (keep `Loading`/`LoadError`), `Reader.tsx` becomes `StudyView.tsx`.
- CSS: `--nav-h` (and its three uses), `.mushaf-layout*`, `--box-w`, `--box-h`, `.side-box*`, the `@media (min-width:1440px)` block, `.menu-pop*`, `.menu-wrap`, `.top, .mushaf-bar { padding-left: 56px }`, `.home { padding-top: calc(60px …) }`, and the dead rules `.card-head/.card-foot`, `.eyebrow`, `.daily .*`, `.continue`, `.tiles/.tile`, `.chev-next/.chev-prev`.
- Tidy duplicates (separate commit, no behaviour change): `.mushaf-flow`, `.ayah-bar`, `.num`, `.study-panel`, and the repeated sticky-header override.
- In `PageReader.tsx`: `side`, `box`, `boxBottomRef`, `boxRef`, `boxWas`, the `--box-h` observer and the box-open re-scroll (it exists only because the box reflowed the text). Keep `scrollTo`/`settling`: they solve a different problem (estimated heights of pages not yet laid out).

### An existing bug to fix on the way

`.app.has-player { --player-h: 64px }` never applies (`App.tsx` renders a static `class="app"`), so `--player-h` has always been 0 and the bottom box overlapped the player bar. Fix: `PlayerBar` measures itself and publishes `--player-h` while mounted (a `ResizeObserver`), declare `--player-h: 0px` on `:root`, delete `.app.has-player`.

## 10. Order of work

Risky first. Each step has its own tests and leaves everything green. Commit per step.

1. **Router: base + layer, no visual change.** `parseRoute` → `{base, layer}`, `mushafAt`, `layers.ts`; App renders the mushaf always plus the matching layer in a plain fixed overlay; `inert`; delete `scrollTo(0,0)`; scroll snapshot/restore. Rewrite `router.test.ts`. New e2e: *a layer keeps the mushaf's scroll*, *no stranding*.
2. **`--player-h`, `--nav-h`, dead CSS.** Add e2e *the player bar never covers the inspector or sheet*.
3. **App bar.** One bar, burger inside it. Retire `PageHeader`, `.menu-wrap`, the padding hacks. Publish `--bar-h`.
4. **Drawer.** Focus trap, Escape, backdrop, `useBackDismiss`, RTL, `inert`. Rewrite the menu e2e; add *the drawer opens, closes and Back dismisses it*.
5. **Desktop inspector grid.** Delete `.side-box`, `--box-w`, `--box-h`, `.mushaf-layout`, the 1440px block, the re-scroll. New e2e *the inspector follows the recitation and never moves the text*.
6. **Phone bottom sheet.** `Sheet.tsx`, `scroll-margin-bottom`, `--sheet-h`. New e2e *the sheet can be dragged away*.
7. **Inspector actions and repeat-this-ayah.** `loopAyah`/`looping` in `audio.ts`; two labelled buttons plus icon row; repeat behind More in verse rows. Unit test: repeat infinity never advances. New e2e *repeat this ayah loops the recording*.
8. **Study view layer.** Rename `Reader.tsx`; `#/verse/…` is a layer with Close. Mechanical `#/ayah/…` → `#/verse/…` in e2e where tests mean the verse screen (including `subpath.spec.ts` and `a11y.spec.ts`).
9. **Settings.** `translationPlace` plus migration (`store.test.ts`), drop `readMode`, trim `PageOptions` (new e2e *options no longer repeat Settings*), reorder, then the `inline` and `off` placements.
10. **Floating card clean-up.** Remove the hardcoded `70`; keep hover preview.
11. **Full sweep.** Three themes × two languages through axe; confirm `main#main :is(…)` matches on every route.
12. **iPhone 1.** Delete `TabView`, `AppTab`, `QuranRoute`, `quranPath`, `switchReadMode`; one `MushafReaderView` plus full-screen covers for layers; real leading drawer; one toolbar.
13. **iPhone 2.** Sheet detents (`.presentationDetents([.fraction(0.45), .large])`, drag indicator, background interaction); regular-width inspector column; the eight actions; `AyahPlayer.loop(ayahID:)`.
14. **iPhone 3.** `translationPlace` migration (delete `PageBox`, `ReadMode`); trim `PageOptionsBox`; rewrite `testReadModeDefaultsToPageAndIsSaved`; add the five-item drawer's missing **Search** screen (the app has none yet; do it last, it is new feature work).
15. **Docs.** Update `docs/PLAN.md` §9 and §1; add a short `docs/navigation.md` if this document drifts.

### Existing e2e that will change (by name)

Whole `reader` describe and everything asserting `article#a-N` (now the Study layer: `#/ayah/…` → `#/verse/…`); *tapping an ayah shows its translation in a box at the side* (rewrite as inspector, assert `scrollY` and the text box do not move); *the box can be on the right* (delete); *two translations* (retarget to `inspector`); *the reading view is a setting* (rewrite); *verse links always open verse by verse* (a Study layer over the mushaf); *shows the Quran … Al-Fatiha* and *then where you left off* (drop `readMode`); the three recitation-follow tests (`side-box` → `inspector`); *tapping the page opens reading options* (drop the font control); *the translation is a box at the bottom by default* (rewrite for the sheet); *over the ayah, as a card* (`pageBox: 'popup'` → `translationPlace: 'card'`); *no bottom bar: one small menu button* (becomes the drawer test); the Study Quran page-view chips test; `subpath.spec.ts`; `a11y.spec.ts`.

Things that must **stay** true: no `.bottom-nav`, no `main .tile`, no "Next page" button, no "Reading view" control on the page; `Menu` button; `navigation "Main"` with `Quran`, `Today`, `Search`, `Saved`, `Settings` and `aria-current="page"`.

## 11. Things to watch

- `share.ts` builds `#/ayah/S/A` links; under the new model they open the mushaf with that ayah selected. That is correct; leave a one-line comment so nobody "fixes" it to `#/verse`.
- The player bar is centred on the viewport at ≥1000px while the text column is offset by the inspector. Deliberate (it is a global control); flag it in design review.
- `.ay` has `tabIndex={0}` on all 6,236 spans. With the mushaf always mounted, keep the `inert` guard; a later pass could make only the selected or playing ayah focusable.
- Safari: `content-visibility: auto` clips to the page box; pages keep `padding-inline: 12px; margin-inline: -12px` so glyph overhang is not cut off. Do not remove it.
- Persian (RTL) is half the audience. Test every step in both languages.

## 12. Verification

- `cd web && npm run typecheck && npm test && npx playwright test` (builds first; see `AGENTS.md`).
- `python3 -m unittest discover -s tools/tests`
- `cd ios/ZekrKit && swift test`; CI builds the iPhone app on macOS (`gh workflow run ci.yml --ref <branch>` runs it on any branch).
- Look at it: build, serve with `npx vite preview`, take screenshots at 390×844 and 1280×800 in English and Persian, light and dark. Tests do not catch "ugly".
- Nothing has been tried on a real iPhone yet. Say so honestly in every report.
