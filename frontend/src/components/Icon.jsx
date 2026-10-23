const P = {
  users: 'M9 8a3 3 0 1 0 0-.1M3 20c.7-3.6 3.2-5.5 6-5.5s5.3 1.9 6 5.5M17 9a2.4 2.4 0 1 0 0-.1M16.5 14.6c2.4.3 4 2 4.5 4.4',
  pin: 'M12 21s-7-6-7-11.5A7 7 0 0 1 19 9.5C19 15 12 21 12 21zM12 7.5a2.5 2.5 0 1 0 0 .1',
  landmark: 'M3 20h18M5 20V10M19 20V10M3 10l9-6 9 6M9 20v-5h6v5',
  book: 'M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 17h5',
  image: 'M3 6h18v13H3zM3 15l5-5 5 5 3-3 5 5M16 9.5a1 1 0 1 0 0-.1',
  verified: 'M12 3l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2zM8.5 12l2.4 2.4 4.6-4.8',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  grad: 'M3 10l9-5 9 5-9 5zM7 12v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  leaf: 'M5 19C5 10 11 5 20 4c0 9-5 15-14 15zM5 19l8-8',
}

export default function Icon({ name, size = 22, stroke = 1.7, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  )
}
