// Small stroke icons for the admin panel (decorative: the visible label always carries the meaning).
const PATHS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z M9 12l2 2 4-4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5 M17 5a3 3 0 0 1 0 6 M18.5 14.8c1.8.6 3 2.2 3.3 4.2',
  landmark: 'M3 21h18 M5 21V10 M19 21V10 M9 21V10 M15 21V10 M3 10l9-6 9 6',
  pen: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z M14 7l3 3',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.5h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5H5V6h5',
  chevron: 'M6 9l6 6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  download: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  panel: 'M4 5h16v14H4z M9 5v14',
  logout: 'M9 4H5v16h4 M16 8l4 4-4 4 M20 12H9',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17h.01',
}

export default function AdminIcon({ name, size = 18 }) {
  return (
    <svg className="ad-icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {(PATHS[name] || '').split(' M').map((d, i) => <path key={i} d={i === 0 ? d : `M${d}`} />)}
    </svg>
  )
}
