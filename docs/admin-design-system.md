# Admin design system

Everything lives in `frontend/src/admin/admin.css`, scoped to `.adm`, so the public site is untouched.

- **Frame:** `admin/Shell.jsx`. One left sidebar (groups: Overview, People, Content; search at the top; language, theme and account at the bottom).
  It collapses to a 64px icon rail (remembered in the browser) and becomes a drawer below 900px. There is no top navigation; the admin renders outside the public layout.
- **Tokens:** `--a-*` (surfaces, text, hairlines, one forest-green accent, green/amber/red for meaning only). Light and dark are both defined, following the site's theme switch.
- **Buttons:** `btn-dark` = the single primary action; `btn-outline` = useful secondary; `btn-ghost` = quiet (row and toolbar actions);
  `btn-ok` = a positive confirmation (Approve); `btn-danger` = destructive confirmations only.
- **Status** (`StatusBadge`): a dot plus the word. Green = published/approved, amber = draft/pending, grey = archived/rejected. Record status is never shown as a button.
- **Tables** (`admin/DataTable.jsx`): `table-layout: fixed`, explicit column widths, names wrap at word boundaries (two lines), email/URLs are cut with an ellipsis and a tooltip,
  hairline row dividers, sticky header. Below 720px of *container* width a row becomes a labelled card.
- **Overlays:** menus and palette pop in (120ms), dialogs scale in, record editors open as a right-hand drawer. All motion is CSS and is disabled by `prefers-reduced-motion`.
- **Gotcha worth remembering:** do not put `container-type`, `transform` or a lingering animation on an ancestor of a `position: fixed` element (menus, dialogs):
  it becomes their containing block. Row menus are portalled into `.adm` for this reason.
