import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventICS } from './calendar.js'

test('an all-day event runs to the next day; a timed one is in Dhaka time', () => {
  const now = new Date(Date.UTC(2026, 0, 2, 3, 4))
  const a = eventICS({ uid: 'x', title: 'Iftar, 2026; reunion', date: '2026-03-10', now })
  assert.match(a, /DTSTART;VALUE=DATE:20260310\r\nDTEND;VALUE=DATE:20260311/)
  assert.match(a, /SUMMARY:Iftar\\, 2026\\; reunion/)
  const b = eventICS({ uid: 'y', title: 'Meet', date: '2026-12-31', time: '17:30', venue: 'TSC', now })
  assert.match(b, /DTSTART;TZID=Asia\/Dhaka:20261231T173000/)
  assert.match(b, /LOCATION:TSC/)
  const c = eventICS({ uid: 'z', title: 'Fair', date: '2026-12-31', endDate: '2027-01-02', now })
  assert.match(c, /DTEND;VALUE=DATE:20270103/)
})
