// An event as a calendar file (.ics) that phones and computers open in their calendar app.
const pad = (n) => String(n).padStart(2, '0')
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const day = (iso) => iso.replace(/-/g, '')
function nextDay(iso) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` }

export function eventICS({ uid, title, date, endDate, time, venue, description, url, now = new Date() }) {
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`
  const when = time
    ? [`DTSTART;TZID=Asia/Dhaka:${day(date)}T${time.replace(':', '')}00`, `DTEND;TZID=Asia/Dhaka:${day(endDate || date)}T${pad(Math.min(23, Number(time.slice(0, 2)) + 2))}${time.slice(3, 5)}00`]
    : [`DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${nextDay(endDate || date)}`]
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BSWA//Events//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${uid}@bswa`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${esc(title)}`,
    venue ? `LOCATION:${esc(venue)}` : '', description ? `DESCRIPTION:${esc(description)}` : '', url ? `URL:${url}` : '',
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n')
}
