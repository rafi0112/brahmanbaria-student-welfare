# Public site design system

The public site (`frontend/src/styles.css`) and the admin workspace (`frontend/src/admin/admin.css`, scoped to `.adm`) share one control language. The public side is warmer and more editorial.

## Tokens (`:root` in `styles.css`)

| Token | Light | Use |
| --- | --- | --- |
| `--paper` | `#f8f2e9` | page canvas (warm cream) |
| `--paper-2` | `#f0e8db` | tinted section (map band) |
| `--card` | `#fffdf8` | inputs, cards, panels |
| `--ink` | `#232222` | text, primary buttons (`--btn-ink`) |
| `--muted` | `#6b675f` | supporting text (darker than the brief's `#77736D` to keep 4.5:1 on cream) |
| `--line` / `--line-2` | `#e5ded3` / `#d6cdbf` | hairlines / input and outline borders |
| `--forest` | `#214737` | the one brand accent: active nav underline, focus ring, map selection, join band |
| `--sage` | `#c6d3ce` | one surface (community panel) and the small quick-link icon squares |
| `--peach` | `#f6d8ba` | reserved; not used on the home page |
| `--gold` / `--gold-ink` | `#b69a62` / `#7a6232` | eyebrow hairlines, kickers, quote mark only |

Dark theme redefines the same names (warm near-black canvas, cream primary buttons). Radii: `--r-sm` 8, `--r` 10, `--r-card` 18, `--r-lg` 24.

## Buttons

They follow the admin `.adm .btn` conventions: a soft rectangle, a 1px border, weight 600, colour-only hover and a 1px press. The public buttons are 46px tall (38px for `.btn-sm`) where the admin ones are 36/30.

- `.btn-dark`: the primary action, in ink (cream in dark mode).
- `.btn-brand` (alias `.btn-leaf`): forest green, used sparingly.
- `.btn-outline` / `.btn-ghost`: secondary actions with a border.
- `.btn-quiet`: no border.
- `.btn-light`: the action on dark bands.
- `.btn-text`: text link actions.
- `.btn-danger`: destructive actions.
- `aria-busy="true"` swaps the label for a spinner without changing the button's size.
- Icons with `.arr` move 3px on hover.

## Motion

- **Timing:** `--dur` 180ms for controls and `--dur-2` 320ms for underlines and the drawer. Easing is `--ease` / `--ease-out`.
- **Hero:** the copy fades and rises with a 60ms stagger, and the artwork fades in from a 1.03 scale.
- **Scroll reveal:** `components/Reveal.jsx` fades content in once per element, the first time it enters the viewport. Content starts hidden only under `html.js`, so nothing is invisible without JavaScript.
- **Cards:** on hover, image cards zoom their photo to about 1.04 over 0.8s. The card itself does not move.
- **Header:** the glass bar becomes denser once the page scrolls. The drawer slides and fades, with a short stagger on its links.
- **Reduced motion:** `prefers-reduced-motion` turns off every animation and transition, and reveals show immediately.

## Layout

- **Content width:** `--wrap` is 1520px, with a fluid gutter of `clamp(16px, 4.2vw, 56px)`.
- **Header:** 68px tall (60px on phones). The full-width bar uses `backdrop-filter`. Below 1180px the links move into the drawer, and below 760px the account buttons do too.
- **Home hero:** the approved artwork (`public/images/hero-art-*.webp`) is a real image with live HTML text over it. Phones show it as a banner above the copy.
- **Account pages:** these use `components/AuthShell.jsx`, a crop of the same artwork beside the form.
