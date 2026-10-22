import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApi } from '../lib/api.js'
import { useApp } from '../lib/app.jsx'
import { Badge, MediaPhoto } from '../components/ui.jsx'
import { ContentList, EditorGate, StatusPanel, useEntryEditor } from './content.jsx'
import { Field, ImagePicker, Modal, Notice, PageHeader, slugFrom, useUnsavedGuard } from './kit.jsx'

const CATS = ['mosque', 'bridge', 'memorial', 'temple', 'railway', 'river']

export function HeritageList() {
  const { t, pick } = useApp()
  const ups = useApi('/upazilas')
  const upOptions = (ups.data?.items || []).map((u) => [u.slug, pick(u.nameBn, u.nameEn)])
  return (
    <ContentList kind="place" title={t('ad.her.title')} desc={t('ad.her.desc')} addLabel={t('ad.her.add')} addPath="/admin/heritage/new"
      emptyHint={t('ad.her.emptyHint')} editPath={(r) => `/admin/heritage/${r.id}/edit`} publicPath={(r) => `/heritage/${r.slug}`}
      extra={[
        { key: 'category', label: t('ad.her.category'), all: t('ad.her.anyCategory'), options: CATS.map((c) => [c, t(`cat.${c}`)]) },
        { key: 'upazila', label: t('auth.upazila'), all: t('ad.her.anyUpazila'), options: upOptions },
      ]}
      columns={[
        {
          label: t('ad.her.col.place'), render: (r) => (
            <span className="ad-person">
              <MediaPhoto id={r.data.images?.[0]} url={r.data.imageUrls?.[0]} alt="" className="ad-mini" sizes="64px" />
              <span><strong>{pick(r.data.nameBn, r.data.nameEn) || r.title}</strong><br /><small className="muted">/{r.slug}</small></span>
            </span>
          ),
        },
        { label: t('ad.her.category'), render: (r) => (r.data.category ? t(`cat.${r.data.category}`) : '—') },
        {
          label: t('ad.her.col.location'), render: (r) => {
            const up = (ups.data?.items || []).find((u) => u.slug === r.data.upazila)
            return <>{up ? pick(up.nameBn, up.nameEn) : '—'}{r.data.lat != null ? <><br /><small className="muted">{r.data.lat}, {r.data.lng}</small></> : null}</>
          },
        },
        { label: t('ad.her.col.checked'), render: (r) => (r.data.verified ? <Badge tone="leaf">✓ {t('place.verified')}</Badge> : <Badge tone="muted">{t('place.unverified')}</Badge>) },
      ]} />
  )
}

const blank = () => ({
  nameEn: '', nameBn: '', slug: '', category: 'mosque', upazila: '', address: '', lat: '', lng: '', mapLink: '', summary: '', details: '', period: '', visitor: '',
  lastVerified: '', verified: false, featured: false, facts: [], sources: [], images: [],
})

const fromEntry = (e) => ({
  nameEn: e.data.nameEn || '', nameBn: e.data.nameBn || '', slug: e.slug || '', category: e.data.category || 'mosque', upazila: e.data.upazila || '',
  address: e.data.address || '', lat: e.data.lat ?? '', lng: e.data.lng ?? '', mapLink: e.data.mapLink || '', summary: e.data.summary || '', details: e.data.details || '',
  period: e.data.period || '', visitor: e.data.visitor || '', lastVerified: e.data.lastVerified || '', verified: !!e.data.verified, featured: !!e.featured,
  facts: (e.data.facts || []).map((f) => ({ ...f })), sources: [...(e.data.sources || [])],
  images: (e.data.images || []).map((ref, i) => ({ ref, url: e.data.imageUrls?.[i] || '' })),
})

const num = (s) => (s === '' || s == null ? null : Number(s))

const toBody = (v) => ({
  slug: v.slug.trim(), featured: v.featured,
  data: {
    nameEn: v.nameEn, nameBn: v.nameBn, category: v.category, upazila: v.upazila, address: v.address, lat: num(v.lat), lng: num(v.lng), mapLink: v.mapLink,
    summary: v.summary, details: v.details, period: v.period, visitor: v.visitor, lastVerified: v.lastVerified, verified: v.verified,
    facts: v.facts.filter((f) => f.label.trim() || f.value.trim()), sources: v.sources.map((s) => s.trim()).filter(Boolean), images: v.images.map((i) => i.ref).filter(Boolean),
  },
})

function Preview({ v, upName, onClose }) {
  const { t } = useApp()
  return (
    <Modal title={t('ad.preview')} onClose={onClose} wide>
      <article className="ad-preview">
        <p className="muted small">{t('ad.her.previewNote')}</p>
        <div className="detail-hero">
          {v.images[0] && <MediaPhoto id={v.images[0].ref} url={v.images[0].url} alt="" shape="shape-r" sizes="720px" />}
        </div>
        <Badge tone="gold">{t(`cat.${v.category}`)}</Badge>
        <h1>{v.nameEn || v.nameBn || t('ad.her.untitled')}</h1>
        {v.nameBn && v.nameEn && <p className="muted" lang="bn">{v.nameBn}</p>}
        <p className="muted">{[upName, v.address, v.period].filter(Boolean).join(' · ')}</p>
        <p className="lede">{v.summary}</p>
        {v.details.split('\n\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
        {v.facts.length > 0 && <dl className="facts">{v.facts.filter((f) => f.label && f.value).map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
        {v.sources.filter(Boolean).length > 0 && <ul className="sources">{v.sources.filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}</ul>}
      </article>
    </Modal>
  )
}

export function HeritageEditor() {
  const { id } = useParams()
  const { t, pick } = useApp()
  const nav = useNavigate()
  const ed = useEntryEditor('place', id, '/admin/heritage')
  const ups = useApi('/upazilas')
  const [v, setV] = useState(blank)
  const [base, setBase] = useState(null)
  const [slugTouched, setSlugTouched] = useState(false)
  const [preview, setPreview] = useState(false)
  useEffect(() => { if (ed.entry) { const f = fromEntry(ed.entry); setV(f); setBase(f); setSlugTouched(true) } }, [ed.entry])
  useEffect(() => { if (!id && !slugTouched) setV((s) => ({ ...s, slug: slugFrom(s.nameEn) })) }, [v.nameEn, id, slugTouched])
  const dirty = useMemo(() => (base ? JSON.stringify(base) !== JSON.stringify(v) : (v.nameEn || v.nameBn || v.summary) !== ''), [base, v])
  useUnsavedGuard(dirty)
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const e = ed.fields
  const upList = ups.data?.items || []
  const upName = (upList.find((u) => u.slug === v.upazila) && pick(upList.find((u) => u.slug === v.upazila).nameBn, upList.find((u) => u.slug === v.upazila).nameEn)) || ''

  const submit = async (ev) => {
    ev.preventDefault()
    const saved = await ed.save(toBody(v), (s) => `/admin/heritage/${s.id}/edit`)
    if (saved) setBase(fromEntry(saved))
  }
  const leave = () => { if (!dirty || window.confirm(t('ad.leaveConfirm'))) nav('/admin/heritage') }
  const move = (list, i, d) => { const a = [...list]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a }

  return (
    <section aria-labelledby="her-edit-h">
      <PageHeader title={<span id="her-edit-h">{t(id ? 'ad.her.edit' : 'ad.her.add')}</span>} desc={t('ad.her.editDesc')}
        crumbs={[{ to: '/admin/heritage', label: t('ad.her.title') }, { label: id ? (v.nameEn || v.nameBn || '…') : t('ad.her.add') }]} />
      <EditorGate editor={ed}>
        <Notice notice={ed.notice} onClose={ed.clear} />
        <div className="ad-editor">
          <form onSubmit={submit} noValidate className="ad-form ad-main">
            <fieldset className="ad-section"><legend>{t('ad.her.sec.names')}</legend>
              <div className="ad-grid">
                <Field label={t('ad.her.nameEn')} required error={e.nameEn} max={160} count={v.nameEn.length}>{(fid, bad) => <input id={fid} value={v.nameEn} onChange={set('nameEn')} maxLength={160} aria-invalid={bad} />}</Field>
                <Field label={t('ad.her.nameBn')} error={e.nameBn} max={160} count={v.nameBn.length}>{(fid, bad) => <input id={fid} value={v.nameBn} onChange={set('nameBn')} maxLength={160} aria-invalid={bad} lang="bn" />}</Field>
              </div>
              <Field label={t('ad.slug')} required error={e.slug} hint={t('ad.slugHint')}>{(fid, bad) => (
                <input id={fid} value={v.slug} onChange={(ev) => { setSlugTouched(true); setV({ ...v, slug: ev.target.value.toLowerCase() }) }} maxLength={80} aria-invalid={bad} />)}</Field>
              {id && <p className="notice small">{t('ad.her.slugWarn')}</p>}
              <div className="ad-grid">
                <Field label={t('ad.her.category')} required error={e.category}>{(fid, bad) => <select id={fid} value={v.category} onChange={set('category')} aria-invalid={bad}>{CATS.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}</select>}</Field>
                <Field label={t('auth.upazila')} error={e.upazila}>{(fid, bad) => (
                  <select id={fid} value={v.upazila} onChange={set('upazila')} aria-invalid={bad}><option value="">—</option>{upList.map((u) => <option key={u.slug} value={u.slug}>{pick(u.nameBn, u.nameEn)}</option>)}</select>)}</Field>
              </div>
            </fieldset>

            <fieldset className="ad-section"><legend>{t('ad.her.sec.where')}</legend>
              <Field label={t('ad.her.address')} error={e.address} max={200} count={v.address.length}>{(fid, bad) => <input id={fid} value={v.address} onChange={set('address')} maxLength={200} aria-invalid={bad} />}</Field>
              <div className="ad-grid">
                <Field label={t('ad.her.lat')} error={e.lat} hint={t('ad.her.coordHint')}>{(fid, bad) => <input id={fid} value={v.lat} onChange={set('lat')} inputMode="decimal" aria-invalid={bad} />}</Field>
                <Field label={t('ad.her.lng')}>{(fid, bad) => <input id={fid} value={v.lng} onChange={set('lng')} inputMode="decimal" aria-invalid={bad} />}</Field>
              </div>
              <Field label={t('ad.her.mapLink')} error={e.mapLink}>{(fid, bad) => <input id={fid} value={v.mapLink} onChange={set('mapLink')} inputMode="url" placeholder="https://" aria-invalid={bad} />}</Field>
            </fieldset>

            <fieldset className="ad-section"><legend>{t('ad.her.sec.story')}</legend>
              <Field label={t('ad.her.summary')} error={e.summary} max={500} count={v.summary.length}>{(fid, bad) => <textarea id={fid} rows={2} value={v.summary} onChange={set('summary')} maxLength={500} aria-invalid={bad} />}</Field>
              <Field label={t('ad.her.details')} error={e.details} hint={t('ad.her.detailsHint')} max={30000} count={v.details.length}>{(fid, bad) => <textarea id={fid} rows={10} value={v.details} onChange={set('details')} maxLength={30000} aria-invalid={bad} />}</Field>
              <div className="ad-grid">
                <Field label={t('ad.her.period')} error={e.period} hint={t('ad.her.periodHint')} max={120} count={v.period.length}>{(fid, bad) => <input id={fid} value={v.period} onChange={set('period')} maxLength={120} aria-invalid={bad} />}</Field>
                <Field label={t('ad.her.lastVerified')} error={e.lastVerified}>{(fid, bad) => <input id={fid} type="date" value={v.lastVerified} onChange={set('lastVerified')} aria-invalid={bad} />}</Field>
              </div>
              <Field label={t('ad.her.visitor')} error={e.visitor} hint={t('ad.her.visitorHint')} max={500} count={v.visitor.length}>{(fid, bad) => <textarea id={fid} rows={2} value={v.visitor} onChange={set('visitor')} maxLength={500} aria-invalid={bad} />}</Field>
              <label className="check"><input type="checkbox" checked={v.verified} onChange={set('verified')} /> {t('ad.her.verified')}</label>
              <label className="check"><input type="checkbox" checked={v.featured} onChange={set('featured')} /> {t('ad.her.featured')}</label>
            </fieldset>

            <fieldset className="ad-section"><legend>{t('ad.her.sec.facts')}</legend>
              {e.facts && <small className="err" role="alert">{e.facts}</small>}
              {v.facts.map((f, i) => (
                <div key={i} className="ad-row-edit">
                  <input aria-label={t('ad.her.factLabel')} placeholder={t('ad.her.factLabel')} value={f.label} onChange={(ev) => setV({ ...v, facts: v.facts.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)) })} />
                  <input aria-label={t('ad.her.factValue')} placeholder={t('ad.her.factValue')} value={f.value} onChange={(ev) => setV({ ...v, facts: v.facts.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)) })} />
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={t('cm.remove')} onClick={() => setV({ ...v, facts: v.facts.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setV({ ...v, facts: [...v.facts, { label: '', value: '' }] })}>+ {t('ad.her.addFact')}</button>
            </fieldset>

            <fieldset className="ad-section"><legend>{t('ad.her.sec.sources')}</legend>
              <p className="muted small">{t('ad.her.sourcesHint')}</p>
              {e.sources && <small className="err" role="alert">{e.sources}</small>}
              {v.sources.map((s, i) => (
                <div key={i} className="ad-row-edit">
                  <input aria-label={t('ad.her.source')} placeholder="https://" inputMode="url" value={s} onChange={(ev) => setV({ ...v, sources: v.sources.map((x, j) => (j === i ? ev.target.value : x)) })} />
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={t('cm.remove')} onClick={() => setV({ ...v, sources: v.sources.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setV({ ...v, sources: [...v.sources, ''] })}>+ {t('ad.her.addSource')}</button>
            </fieldset>

            <fieldset className="ad-section"><legend>{t('ad.her.sec.images')}</legend>
              <p className="muted small">{t('ad.her.imagesHint')}</p>
              {e.images && <small className="err" role="alert">{e.images}</small>}
              {v.images.map((im, i) => (
                <div key={i} className="ad-image-slot">
                  <ImagePicker label={i === 0 ? t('ad.her.cover') : `${t('ad.her.photoN')} ${i + 1}`} value={im.ref} url={im.url}
                    legacyUrl={im.ref && !im.url ? `/images/${im.ref}-640.webp` : undefined}
                    onChange={(m) => setV({ ...v, images: m ? v.images.map((x, j) => (j === i ? { ref: m.path, url: m.url } : x)) : v.images.filter((_, j) => j !== i) })} />
                  <div className="row">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} aria-label={t('cm.up')} onClick={() => setV({ ...v, images: move(v.images, i, -1) })}>↑</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={i === v.images.length - 1} aria-label={t('cm.down')} onClick={() => setV({ ...v, images: move(v.images, i, 1) })}>↓</button>
                  </div>
                </div>
              ))}
              {v.images.length < 12 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setV({ ...v, images: [...v.images, { ref: '', url: '' }] })}>+ {t('ad.her.addImage')}</button>}
            </fieldset>

            <div className="row ad-savebar">
              <button className="btn btn-dark" disabled={ed.busy || !dirty}>{ed.busy ? t('state.loading') : t(ed.entry ? 'ad.save' : 'ad.saveDraft')}</button>
              <button type="button" className="btn btn-ghost" onClick={leave}>{t('admin.roles.cancel')}</button>
            </div>
          </form>
          <StatusPanel entry={ed.entry} busy={ed.busy} onAct={ed.act} dirty={dirty && !!ed.entry} publicUrl={ed.entry ? `/heritage/${ed.entry.slug}` : null}
            onPreview={() => setPreview(true)} title={v.nameEn || v.nameBn} />
        </div>
        {preview && <Preview v={{ ...v, images: v.images.filter((i) => i.ref) }} upName={upName} onClose={() => setPreview(false)} />}
      </EditorGate>
      <p><Link className="link-arrow" to="/admin/heritage">← {t('ad.her.title')}</Link></p>
    </section>
  )
}
