import { useState } from 'react'
import { api } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { IMPORT_TEMPLATE, rowsFromCsv } from '../lib/csv.js'
import { Modal, useErrText } from './kit.jsx'
import Icon from './icons.jsx'

// Add many directory records at once from a spreadsheet saved as CSV. First a check (nothing is saved) that shows how
// many rows are ready, already in the directory, or have problems, and why; then the ready rows are added.
const FIELD = {
  name: ['নাম', 'Name'], batch: ['ব্যাচ', 'Batch'], department: ['বিভাগ', 'Department'], session: ['সেশন', 'Session'], upazila: ['উপজেলা', 'Upazila'],
  union: ['ইউনিয়ন', 'Union'], gender: ['লিঙ্গ', 'Gender'], bloodGroup: ['রক্তের গ্রুপ', 'Blood group'], phone: ['ফোন', 'Phone'], note: ['নোট', 'Note'], row: ['সারি', 'Row'],
}

export default function BulkImport({ onClose, onDone }) {
  const { pick, n } = useApp()
  const errText = useErrText()
  const [file, setFile] = useState('')
  const [rows, setRows] = useState(null)
  const [unknown, setUnknown] = useState([])
  const [check, setCheck] = useState(null)
  const [done, setDone] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const template = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + IMPORT_TEMPLATE + 'Rahim Uddin,15,Accounting,2019-20,Sarail,,male,B+,01712345678,\r\n'], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'directory-import-template.csv' })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const send = (list, dryRun) => api('/admin/imported-students/import', { method: 'POST', body: JSON.stringify({ rows: list, dryRun }) })

  const choose = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setMsg(''); setCheck(null); setDone(null); setRows(null); setFile(f.name)
    if (!/\.csv$/i.test(f.name)) { setMsg(pick('শুধু CSV ফাইল চলবে। Excel-এ File > Save As > “CSV UTF-8” দিয়ে সংরক্ষণ করে আবার দিন।', 'Only CSV files work. In Excel use File > Save As > “CSV UTF-8”, then choose that file.')); return }
    if (f.size > 3 * 1024 * 1024) { setMsg(pick('ফাইলটি ৩ MB-এর বেশি বড়। ভাগ করে দিন।', 'The file is over 3 MB. Split it into smaller files.')); return }
    const r = rowsFromCsv(await f.text())
    if (r.error) {
      setMsg(r.error === 'no_name'
        ? pick('প্রথম সারিতে কলামের নাম থাকতে হবে, অন্তত “name” বা “নাম”। নমুনা ফাইলটি দেখুন।', 'The first row must name the columns, at least “name”. See the template.')
        : pick('ফাইলে কোনো সারি নেই।', 'The file has no rows.'))
      return
    }
    if (r.rows.length > 2000) { setMsg(pick('একবারে সর্বোচ্চ ২০০০ সারি। ফাইলটি ভাগ করে দিন।', 'At most 2000 rows at a time. Split the file.')); return }
    setRows(r.rows); setUnknown(r.unknown)
    setBusy(true)
    try { setCheck(await send(r.rows, true)) } catch (err) { setMsg(errText(err)) } finally { setBusy(false) }
  }
  const run = async () => {
    setBusy(true); setMsg('')
    try { const r = await send(rows, false); setDone(r); onDone(r.counts.added) } catch (err) { setMsg(errText(err)) } finally { setBusy(false) }
  }
  const res = done || check
  const problems = (res?.rows || []).filter((r) => r.status !== 'ready' && r.status !== 'added')

  return (
    <Modal title={pick('একসাথে অনেক রেকর্ড যোগ করুন', 'Add many records at once')} onClose={onClose} wide busy={busy}>
      <div className="bi">
        <ol className="bi-steps">
          <li>{pick('নমুনা ফাইল নামিয়ে Excel বা Google Sheets-এ খুলুন, প্রতি সারিতে একজন। বাংলা বা ইংরেজি কলামের নাম চলবে।', 'Download the template and fill it in Excel or Google Sheets, one person per row. Column names may be in Bangla or English.')}
            <br /><button type="button" className="btn btn-outline btn-sm" onClick={template}><Icon name="download" size={15} /> {pick('নমুনা ফাইল (CSV)', 'Template (CSV)')}</button></li>
          <li>{pick('“CSV UTF-8” হিসেবে সংরক্ষণ করে এখানে দিন। আগে যাচাই হবে, কিছু সংরক্ষণ হবে না।', 'Save it as “CSV UTF-8” and choose it here. It is checked first; nothing is saved yet.')}
            <br /><label className="btn btn-dark btn-sm bi-file"><Icon name="upload" size={15} /> {pick('CSV ফাইল বাছুন', 'Choose a CSV file')}<input type="file" accept=".csv,text/csv" onChange={choose} hidden /></label>
            {file && <small className="muted"> {file}</small>}</li>
        </ol>
        <p className="muted small">{pick('আবশ্যক: নাম, ব্যাচ, বিভাগ (সাইটের তালিকার নামে)। ফোন ০১ দিয়ে ১১ সংখ্যা। একই ফোন, অথবা একই নাম-ব্যাচ-বিভাগের কেউ আগে থেকে থাকলে বাদ যাবে।', 'Required: name, batch, department (as named in the site’s list). Phone: 11 digits starting with 01. Anyone already in the directory (same phone, or same name, batch and department) is skipped.')}</p>
        {busy && <p className="muted" role="status">{pick('যাচাই হচ্ছে…', 'Checking…')}</p>}
        {msg && <p className="notice bad" role="alert">{msg}</p>}
        {unknown.length > 0 && <p className="muted small">{pick('এই কলামগুলো চেনা যায়নি, বাদ দেওয়া হবে: ', 'These columns were not recognised and are ignored: ')}{unknown.join(', ')}</p>}
        {res && (
          <>
            <ul className="bi-counts" role="status">
              {done
                ? <li className="ok"><b>{n(done.counts.added)}</b> {pick('জন যোগ হয়েছে', 'added')}</li>
                : <li className="ok"><b>{n(check.counts.ready)}</b> {pick('জন যোগের জন্য প্রস্তুত', 'ready to add')}</li>}
              <li><b>{n(res.counts.duplicate)}</b> {pick('জন আগে থেকেই আছে (বাদ)', 'already in the directory (skipped)')}</li>
              <li className={res.counts.invalid ? 'bad' : ''}><b>{n(res.counts.invalid)}</b> {pick('সারিতে সমস্যা', 'rows with problems')}</li>
            </ul>
            {problems.length > 0 && (
              <div className="bi-table">
                <table>
                  <thead><tr><th>{pick('সারি', 'Row')}</th><th>{pick('নাম', 'Name')}</th><th>{pick('কী হয়েছে', 'What happened')}</th></tr></thead>
                  <tbody>
                    {problems.slice(0, 200).map((r) => (
                      <tr key={r.row}>
                        <td>{n(r.row + 1)}</td><td>{r.name || '–'}</td>
                        <td>{r.status === 'duplicate' ? pick('আগে থেকেই আছে', 'Already in the directory') : Object.entries(r.errors || {}).map(([k, v]) => `${pick(...(FIELD[k] || [k, k]))}: ${v}`).join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <small className="muted">{pick('সারি নম্বর ফাইলের হিসাবে (প্রথম সারি কলামের নাম)।', 'Row numbers are as in the file (row 1 is the headings).')}</small>
              </div>
            )}
            <div className="row">
              {!done && <button type="button" className="btn btn-dark" disabled={busy || !check.counts.ready} onClick={run}>{pick(`${n(check.counts.ready)} জন যোগ করুন`, `Add ${check.counts.ready}`)}</button>}
              <button type="button" className="btn btn-ghost" onClick={onClose}>{done ? pick('বন্ধ করুন', 'Close') : pick('বাতিল', 'Cancel')}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
