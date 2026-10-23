# Public site design system (BSWA)

Source of truth: `frontend/src/styles.css` (tokens at the top). The admin workspace keeps its own tokens in `admin.css` (`.adm`).

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#FFF5E9` | canvas |
| `--card` | `#FFFCF7` | inputs, cards |
| `--ink` | `#1E2024` | text |
| `--accent` | `#E94F20` | large marks, active underline, the highlighted last word of a title |
| `--accent-btn` | `#D4431A` | button fill behind white text (4.7:1; `#E94F20` itself is 3.8:1) |
| `--accent-ink` | `#C43E16` | small orange text on cream |
| `--teal` | `#075C4C` | secondary accent: join card, join band, registered-member chips |
| `--line` | `#E8DED3` | borders |
| `--muted` | `#6B6863` | secondary text |

Dark theme redefines the same names.

## Type and shape

Headings: DM Serif Display (single weight). Interface: Manrope. Bengali falls back to Noto Serif Bengali / Hind Siliguri. Buttons are pills (`.btn`, 48px; `.btn-sm`, 38px) with the admin conventions: 1px border, weight 700, colour-only hover, a 1px press. `.btn-dark` is the primary (orange); `.btn-outline` is secondary; `.btn-brand` is teal; `.btn-light` sits on teal. Inputs use a 12px radius.

## Pages

- **Opening:** the home hero and `PageHero` (every inner page) share one composition: eyebrow, serif title with the last word in orange, lede, then a photograph behind a wavy left edge (`.hero-media`, `.phero-media`; below 1000px the mask is dropped).
- **Images:** only the supplied full-size hero (`public/images/bswa/hero-*.webp`) and crops of it and of the existing artwork (`mosque`, `baul`, `river`, `puppets`). The resource packs' other files are 100-200px crops of a mockup board (see their README) and are not used.
- **Students:** monogram cards (the application stores no portraits), a sidebar with the join card, real counts per upazila and quick links, and a profile page with a cover, an overlapping monogram, anchored sections and the role-based details from the API.
- **Account pages:** `AuthShell` with a crop of the same artwork.
- **Motion:** 180-320ms transitions, scroll reveals through `Reveal`, hero entrance; all off under `prefers-reduced-motion`.
