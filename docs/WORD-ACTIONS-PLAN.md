# Word actions: select a word, get what you can do with it (plan, not built)

**Goal.** Select a word of the Quran (Arabic) or of a translation (for example ایمان), by long press on a phone or a
right click / double click on a computer, and get a small menu for *that word*: find it in the Quran, see its root and
meaning, copy it, share it.

## What is there already (nothing new needs to be bought or built from scratch)

| Piece | Where | Used for |
|---|---|---|
| Roots and forms of every word | `data/search/morphology.json` (Quranic Arabic Corpus; `forms` folded form → root ids, `ayahs` roots per ayah) | "same root", the forms of a root |
| Search with exact / root / smart modes and BM25 | `src/smartSearch.ts`, `src/views/Search.tsx` | the results of "find" |
| A Persian gloss for every word, in order | `data/wbw/<surah>.json` | the meaning in the word card |
| Share picture of an ayah | `src/shareCard.ts` | the picture of a word or a found ayah |
| Long press / right click on an ayah opens its panel | `src/views/PageReader.tsx` (`pressAt`, `touch`) | the gesture that this plan must not break |

## Where it works

* Arabic words: every text mode (a Quran font, the lines under the page, word-by-word, the study view).
  **Not** the printed page (`pageStyle: 'printed'`): that is a picture, it has no words to select.
* Translation words: the study view, the lines under the ayahs, the ayah panel, Search results.

## What happens, step by step

1. **Finding the word.** No wrapping of every word in a span (6,236 ayahs; slow, breaks the page layout). From the point
   touched, `caretPositionFromPoint` gives a text position; the word is that position widened to the word's edges with
   `Intl.Segmenter` (Arabic marks and the verse-end ornament are not part of a word).
2. **The gesture.**
   * Phone: a long press on a word selects it (programmatically) and shows a small bar above it. A long press on the
     ayah number or the empty part of the line still opens the ayah's panel, as now. If the reader drags the system's
     selection handles to a phrase, the same bar follows the selection (`selectionchange`, after 300 ms of calm). This
     way Zekr does not fight iOS's own callout; it sits next to it.
   * Computer: a right click on a word (or the context-menu key / Shift+F10 on a selection) opens the same menu; a
     double click selects the word and shows the bar.
   * The ayah's panel gets a "Words" item as the way for a keyboard or a screen reader to the same menu.
3. **The bar** (one row, four buttons) and **the word sheet** (a bottom sheet on a phone, a popover on a computer):

   | Action | What it does | Data it needs |
   |---|---|---|
   | **Find in the Quran** | Opens Search with the word filled in. For an Arabic word: *same root* (default), *this exact form*. For a translation word: in the translation it was selected in. A line shows the count before opening ("312 ayahs") | morphology (loaded on first use), the translation texts |
   | **Meaning** | The word card: the word, its gloss, its root, its other forms, how many times it occurs, the ayahs (jump) | wbw, morphology |
   | **Copy** | The word; or the word with the ayah it is from | none |
   | **Share** | The word card as text or as a picture, with the same look as the ayah picture | `shareCard.ts` |
   | later: **Save the word** | A list of the reader's words (like the saved ayahs) | `localStorage` |
   | later: **Look up** | Opens a dictionary (Dehkhoda, Lane's) in the browser. Off by default: it sends the word to another site | none |

4. **Search route.** `#/search?q=ایمان&mode=root` (and `&in=<translation id>`); the Search view reads these, so the
   result page can be shared and the back button returns to the ayah.

## Order of work (each step ships on its own)

1. The selection bar and "Find in the Quran" (same root, exact form, in the translation). Search takes `q`, `mode`, `in`.
2. The word sheet: gloss, root, forms, count, jump to the ayahs.
3. Copy and Share (text, then the picture); "Save the word".
4. Dictionary links (opt-in), "find in the tafsir" for the build that has Al-Mizan.

Each step comes with end-to-end tests on made-up text (long press on a phone size, right click on a computer size, the
keyboard path, a screen reader name on every button) and the same a11y checks as the rest of the app.

## Risks, and what is done about them

* **Word edges in Arabic** (marks, tatweel, the verse-end sign): use the folded form for search and the unfolded text
  for display; test on words with prefixes (والذين) and on verse ends.
* **Several roots for one form** (the corpus has some): show the list, search all of them, let the reader pick one.
* **Gestures that already exist** (long press = ayah panel, horizontal swipe = turn the page, pinch): the word press
  starts only on text, ends at the first finger movement of more than 8 px, and never inside the printed picture.
* **iOS selection**: no attempt to remove its callout; the bar is placed so that it does not cover it (above the selection,
  moves below when there is no room).
* **Speed**: the morphology file (about 1 MB) is loaded on the first use, not at start-up; counts come from the in-memory index.
* **Privacy**: nothing leaves the device unless the reader turns dictionary links on.
* **Licence**: the Quranic Arabic Corpus is GPL; its notice is already on the About page and in `data/search/NOTICE.txt`.
