// A small, strict CSV reader for spreadsheets saved as "CSV (comma delimited)" or "CSV UTF-8" from Excel or Google
// Sheets: quoted fields, doubled quotes, commas and line breaks inside quotes, \r\n or \n line ends, and a leading BOM.
// Semicolon files (some Excel locales) are read when the first line has more semicolons than commas.
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '')
  const firstLine = s.slice(0, s.search(/\r?\n|$/))
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

// The columns a directory import understands, with the headings people are likely to use for them (English or Bangla).
export const IMPORT_COLUMNS = {
  name: ['name', 'full name', 'student name', 'নাম', 'পূর্ণ নাম'],
  batch: ['batch', 'ব্যাচ'],
  department: ['department', 'dept', 'বিভাগ'],
  session: ['session', 'সেশন', 'শিক্ষাবর্ষ'],
  upazila: ['upazila', 'upazilla', 'thana', 'উপজেলা'],
  union: ['union', 'ইউনিয়ন'],
  gender: ['gender', 'sex', 'লিঙ্গ'],
  bloodGroup: ['blood group', 'bloodgroup', 'blood', 'রক্তের গ্রুপ', 'রক্ত'],
  phone: ['phone', 'mobile', 'phone number', 'mobile number', 'contact', 'ফোন', 'মোবাইল', 'মোবাইল নম্বর', 'ফোন নম্বর'],
  note: ['note', 'notes', 'remarks', 'নোট', 'মন্তব্য'],
}

// rowsFromCsv turns the sheet into records by its heading row. Returns { rows, unknown } where unknown lists the
// headings that match no column (they are ignored), or { error } when there is no usable heading.
export function rowsFromCsv(text) {
  const table = parseCsv(text)
  if (table.length < 2) return { error: 'empty' }
  const fold = (h) => h.trim().toLowerCase().replace(/[_\s]+/g, ' ')
  const map = table[0].map((h) => Object.keys(IMPORT_COLUMNS).find((k) => IMPORT_COLUMNS[k].includes(fold(h)) || fold(k) === fold(h)) || null)
  if (!map.includes('name')) return { error: 'no_name' }
  const unknown = table[0].filter((h, i) => !map[i] && h.trim())
  const rows = table.slice(1).map((r) => {
    const o = {}
    map.forEach((k, i) => { if (k) o[k] = (r[i] || '').trim() })
    return o
  })
  return { rows, unknown }
}

export const IMPORT_TEMPLATE = 'name,batch,department,session,upazila,union,gender,bloodGroup,phone,note\r\n'
