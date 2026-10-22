import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { useAuth } from '../lib/auth.jsx'
import Markdown from '../components/Markdown.jsx'
import { MediaPhoto } from '../components/ui.jsx'
import { ContentList, EditorGate, StatusPanel, useEntryEditor } from './content.jsx'
import { Field, ImagePicker, Modal, Notice, PageHeader, slugFrom, useUnsavedGuard } from './kit.jsx'

const CATS = ['community', 'heritage', 'student-life']

export function BlogList() {
  const { t, n, pick } = useApp()
  return (
    <ContentList kind="blog" title={t('ad.blog.title')} desc={t('ad.blog.desc')} addLabel={t('ad.blog.add')} addPath="/admin/blog/new"
      emptyHint={t('ad.blog.emptyHint')} editPath={(r) => `/admin/blog/${r.id}/edit`} publicPath={(r) => `/blog/${r.slug}`}
      extra={[
        { key: 'category', label: t('ad.blog.category'), all: t('ad.blog.anyCategory'), options: CATS.map((c) => [c, t(`cat.${c}`)]) },
        { key: 'author', label: t('ad.blog.author'), text: true },
        { key: 'featured', label: t('ad.blog.featured'), all: t('ad.blog.anyFeatured'), options: [['yes', t('ad.blog.featuredOnly')], ['no', t('ad.blog.notFeatured')]] },
      ]}
      columns={[
        {
          label: t('ad.blog.col.post'), render: (r) => (
            <span className="ad-person">
              <MediaPhoto id={r.data.image} url={r.data.imageUrl} alt="" className="ad-mini" sizes="64px" />
              <span><strong>{pick(r.data.titleBn, r.data.titleEn) || r.title}</strong><br /><small className="muted">/{r.slug}</small></span>
            </span>
          ),
        },
        { label: t('ad.blog.author'), render: (r) => r.data.author || r.authorName || '—' },
        { label: t('ad.blog.category'), render: (r) => <>{r.data.category ? t(`cat.${r.data.category}`) : '—'}{r.data.tags?.length ? <><br /><small className="muted">{r.data.tags.join(', ')}</small></> : null}</> },
        { label: t('ad.blog.col.meta'), render: (r) => <>{r.featured ? '★ ' + t('ad.blog.featured') : '—'}<br /><small className="muted">{n(r.data.readMin || 1)} {t('blog.min')} · {r.publishedAt ? r.publishedAt.slice(0, 10) : t('ad.notPublished')}</small></> },
      ]} />
  )
}

const blank = (author) => ({
  titleEn: '', titleBn: '', slug: '', excerptEn: '', excerptBn: '', bodyEn: '', bodyBn: '', category: 'community', tagsText: '', author,
  image: '', imageUrl: '', imageAlt: '', date: '', featured: false, metaTitle: '', metaDescription: '',
})

const fromEntry = (e) => ({
  titleEn: e.data.titleEn || '', titleBn: e.data.titleBn || '', slug: e.slug || '', excerptEn: e.data.excerptEn || '', excerptBn: e.data.excerptBn || '',
  bodyEn: e.data.bodyEn || '', bodyBn: e.data.bodyBn || '', category: e.data.category || '', tagsText: (e.data.tags || []).join(', '), author: e.data.author || '',
  image: e.data.image || '', imageUrl: e.data.imageUrl || '', imageAlt: e.data.imageAlt || '', date: e.data.date || '', featured: !!e.featured,
  metaTitle: e.data.metaTitle || '', metaDescription: e.data.metaDescription || '',
})

const toBody = (v) => ({
  slug: v.slug.trim(), featured: v.featured,
  data: {
    titleEn: v.titleEn, titleBn: v.titleBn, excerptEn: v.excerptEn, excerptBn: v.excerptBn, bodyEn: v.bodyEn, bodyBn: v.bodyBn, category: v.category,
    tags: v.tagsText.split(',').map((x) => x.trim()).filter(Boolean), author: v.author, image: v.image, imageAlt: v.imageAlt, date: v.date,
    metaTitle: v.metaTitle, metaDescription: v.metaDescription,
  },
})

// Markdown helper buttons: wrap the selection (or insert a template) at the cursor.
function Toolbar({ area, value, onChange }) {
  const { t } = useApp()
  const apply = (before, after = '', sample = '') => {
    const el = area.current
    if (!el) return
    const [a, b] = [el.selectionStart, el.selectionEnd]
    const chosen = value.slice(a, b) || sample
    onChange(`${value.slice(0, a)}${before}${chosen}${after}${value.slice(b)}`)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + chosen.length) })
  }
  const items = [
    ['B', t('ad.md.bold'), () => apply('**', '**', t('ad.md.sampleBold'))], ['I', t('ad.md.italic'), () => apply('*', '*', t('ad.md.sampleItalic'))],
    ['H', t('ad.md.heading'), () => apply('\n\n## ', '\n\n', t('ad.md.sampleHeading'))], ['•', t('ad.md.list'), () => apply('\n\n- ', '\n\n', t('ad.md.sampleItem'))],
    ['”', t('ad.md.quote'), () => apply('\n\n> ', '\n\n', t('ad.md.sampleQuote'))], ['🔗', t('ad.md.link'), () => apply('[', '](https://)', t('ad.md.sampleLink'))],
  ]
  return (
    <div className="ad-toolbar-md" role="toolbar" aria-label={t('ad.md.toolbar')}>
      {items.map(([sym, label, fn]) => <button key={label} type="button" className="btn btn-ghost btn-sm" onClick={fn} aria-label={label} title={label}>{sym}</button>)}
    </div>
  )
}

function Preview({ v, imageUrl, onClose }) {
  const { t, lang } = useApp()
  const [pl, setPl] = useState(lang)
  const title = pl === 'bn' ? v.titleBn || v.titleEn : v.titleEn || v.titleBn
  const body = pl === 'bn' ? v.bodyBn || v.bodyEn : v.bodyEn || v.bodyBn
  return (
    <Modal title={t('ad.preview')} onClose={onClose} wide>
      <div className="chips" role="group" aria-label={t('ad.preview')}>
        {['bn', 'en'].map((l) => <button key={l} type="button" className={`chip ${pl === l ? 'on' : ''}`} aria-pressed={pl === l} onClick={() => setPl(l)}>{l === 'bn' ? 'বাংলা' : 'English'}</button>)}
      </div>
      <article className="article ad-preview">
        <p className="muted small">{t('ad.blog.previewNote')}</p>
        {v.category && <p className="kicker">{t(`cat.${v.category}`)}</p>}
        <h1>{title || t('ad.blog.untitled')}</h1>
        <p className="muted">{[v.author, v.date || new Date().toISOString().slice(0, 10)].filter(Boolean).join(' · ')}</p>
        {(v.image || imageUrl) && <MediaPhoto id={v.image} url={imageUrl} alt={v.imageAlt} shape="shape-a" sizes="720px" />}
        <div className="prose"><Markdown text={body} /></div>
      </article>
    </Modal>
  )
}

export function BlogEditor() {
  const { id } = useParams()
  const { t, n } = useApp()
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const ed = useEntryEditor('blog', id, '/admin/blog')
  const author = profile?.name || user?.email?.split('@')[0] || ''
  const [v, setV] = useState(() => blank(author))
  const [base, setBase] = useState(null) // the last saved values, to detect unsaved changes
  const [lang, setLang] = useState('en')
  const [slugTouched, setSlugTouched] = useState(false)
  const [seo, setSeo] = useState(false)
  const [preview, setPreview] = useState(false)
  const bodyArea = useRef(null)
  useEffect(() => {
    if (ed.entry) { const f = fromEntry(ed.entry); setV(f); setBase(f); setSlugTouched(true) }
  }, [ed.entry])
  useEffect(() => { if (!id && !slugTouched) setV((s) => ({ ...s, slug: slugFrom(s.titleEn) })) }, [v.titleEn, id, slugTouched])
  const dirty = useMemo(() => (base ? JSON.stringify(base) !== JSON.stringify(v) : (v.titleEn || v.titleBn || v.bodyEn || v.bodyBn) !== ''), [base, v])
  useUnsavedGuard(dirty)
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const words = (v[lang === 'en' ? 'bodyEn' : 'bodyBn'].trim().match(/\S+/g) || []).length
  const e = ed.fields

  const submit = async (ev) => {
    ev.preventDefault()
    const saved = await ed.save(toBody(v), (s) => `/admin/blog/${s.id}/edit`)
    if (saved) setBase(fromEntry(saved))
  }
  const leave = () => { if (!dirty || window.confirm(t('ad.leaveConfirm'))) nav('/admin/blog') }

  return (
    <section aria-labelledby="blog-edit-h">
      <PageHeader title={<span id="blog-edit-h">{t(id ? 'ad.blog.edit' : 'ad.blog.add')}</span>} desc={t('ad.blog.editDesc')}
        crumbs={[{ to: '/admin/blog', label: t('ad.blog.title') }, { label: id ? (v.titleEn || v.titleBn || '…') : t('ad.blog.add') }]} />
      <EditorGate editor={ed}>
        <Notice notice={ed.notice} onClose={ed.clear} />
        <div className="ad-editor">
          <form onSubmit={submit} noValidate className="ad-form ad-main">
            <fieldset className="ad-section"><legend>{t('ad.blog.sec.title')}</legend>
              <div className="ad-grid">
                <Field label={t('ad.titleEn')} required error={e.titleEn} max={160} count={v.titleEn.length}>{(fid, bad) => <input id={fid} value={v.titleEn} onChange={set('titleEn')} maxLength={160} aria-invalid={bad} />}</Field>
                <Field label={t('ad.titleBn')} error={e.titleBn} max={160} count={v.titleBn.length}>{(fid, bad) => <input id={fid} value={v.titleBn} onChange={set('titleBn')} maxLength={160} aria-invalid={bad} lang="bn" />}</Field>
              </div>
              <Field label={t('ad.slug')} required error={e.slug} hint={t('ad.slugHint')}>{(fid, bad) => (
                <input id={fid} value={v.slug} onChange={(ev) => { setSlugTouched(true); setV({ ...v, slug: ev.target.value.toLowerCase() }) }} maxLength={80} aria-invalid={bad} />)}</Field>
            </fieldset>

            <fieldset className="ad-section"><legend>{t('ad.blog.sec.content')}</legend>
              <div className="chips" role="tablist" aria-label={t('ad.blog.sec.content')}>
                {['en', 'bn'].map((l) => <button key={l} type="button" role="tab" aria-selected={lang === l} className={`chip ${lang === l ? 'on' : ''}`} onClick={() => setLang(l)}>{l === 'bn' ? 'বাংলা' : 'English'}</button>)}
              </div>
              {lang === 'en' ? (
                <>
                  <Field label={t('ad.excerpt')} error={e.excerptEn} max={400} count={v.excerptEn.length}>{(fid, bad) => <textarea id={fid} rows={2} value={v.excerptEn} onChange={set('excerptEn')} maxLength={400} aria-invalid={bad} />}</Field>
                  <Field label={t('ad.body')} error={e.bodyEn} hint={t('ad.md.hint')}>{(fid, bad) => (
                    <>
                      <Toolbar area={bodyArea} value={v.bodyEn} onChange={(x) => setV({ ...v, bodyEn: x })} />
                      <textarea id={fid} ref={bodyArea} rows={14} value={v.bodyEn} onChange={set('bodyEn')} aria-invalid={bad} maxLength={60000} />
                    </>)}</Field>
                </>
              ) : (
                <>
                  <Field label={t('ad.excerpt')} error={e.excerptBn} max={400} count={v.excerptBn.length}>{(fid, bad) => <textarea id={fid} rows={2} value={v.excerptBn} onChange={set('excerptBn')} maxLength={400} aria-invalid={bad} lang="bn" />}</Field>
                  <Field label={t('ad.body')} error={e.bodyBn} hint={t('ad.md.hint')}>{(fid, bad) => (
                    <>
                      <Toolbar area={bodyArea} value={v.bodyBn} onChange={(x) => setV({ ...v, bodyBn: x })} />
                      <textarea id={fid} ref={bodyArea} rows={14} value={v.bodyBn} onChange={set('bodyBn')} aria-invalid={bad} maxLength={60000} lang="bn" />
                    </>)}</Field>
                </>
              )}
              <p className="muted small">{n(words)} {t('ad.words')} · ≈ {n(Math.max(1, Math.ceil(words / 200)))} {t('blog.min')}</p>
            </fieldset>

            <fieldset className="ad-section"><legend>{t('ad.blog.sec.details')}</legend>
              <div className="ad-grid">
                <Field label={t('ad.blog.category')} error={e.category}>{(fid, bad) => (
                  <select id={fid} value={v.category} onChange={set('category')} aria-invalid={bad}>{CATS.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}</select>)}</Field>
                <Field label={t('ad.blog.author')} error={e.author} max={80} count={v.author.length}>{(fid, bad) => <input id={fid} value={v.author} onChange={set('author')} maxLength={80} aria-invalid={bad} />}</Field>
                <Field label={t('ad.blog.tags')} error={e.tags} hint={t('ad.blog.tagsHint')}>{(fid, bad) => <input id={fid} value={v.tagsText} onChange={set('tagsText')} aria-invalid={bad} />}</Field>
                <Field label={t('ad.blog.date')} error={e.date} hint={t('ad.blog.dateHint')}>{(fid, bad) => <input id={fid} type="date" value={v.date} onChange={set('date')} aria-invalid={bad} />}</Field>
              </div>
              <label className="check"><input type="checkbox" checked={v.featured} onChange={set('featured')} /> {t('ad.blog.featuredLabel')}</label>
            </fieldset>

            <ImagePicker label={t('ad.blog.image')} value={v.image} url={v.imageUrl}
              onChange={(m) => setV({ ...v, image: m ? m.path : '', imageUrl: m ? m.url : '' })} hint={t('ad.blog.imageHint')} />
            {e.image && <small className="err" role="alert">{e.image}</small>}
            <Field label={t('ad.imageAlt')} error={e.imageAlt} hint={t('ad.imageAltHint')}>{(fid, bad) => <input id={fid} value={v.imageAlt} onChange={set('imageAlt')} maxLength={300} aria-invalid={bad} />}</Field>

            <fieldset className="ad-section">
              <legend><button type="button" className="ad-disclose" aria-expanded={seo} onClick={() => setSeo(!seo)}>{seo ? '▾' : '▸'} {t('ad.blog.sec.seo')}</button></legend>
              {seo && (
                <>
                  <Field label={t('ad.metaTitle')} error={e.metaTitle} max={70} count={v.metaTitle.length}>{(fid, bad) => <input id={fid} value={v.metaTitle} onChange={set('metaTitle')} maxLength={70} aria-invalid={bad} />}</Field>
                  <Field label={t('ad.metaDescription')} error={e.metaDescription} max={200} count={v.metaDescription.length}>{(fid, bad) => <textarea id={fid} rows={2} value={v.metaDescription} onChange={set('metaDescription')} maxLength={200} aria-invalid={bad} />}</Field>
                </>
              )}
            </fieldset>

            <div className="row ad-savebar">
              <button className="btn btn-dark" disabled={ed.busy || !dirty}>{ed.busy ? t('state.loading') : t(ed.entry ? 'ad.save' : 'ad.saveDraft')}</button>
              <button type="button" className="btn btn-ghost" onClick={leave}>{t('admin.roles.cancel')}</button>
            </div>
          </form>
          <StatusPanel entry={ed.entry} busy={ed.busy} onAct={ed.act} dirty={dirty && !!ed.entry} publicUrl={ed.entry ? `/blog/${ed.entry.slug}` : null}
            onPreview={() => setPreview(true)} title={v.titleEn || v.titleBn} />
        </div>
        {preview && <Preview v={v} imageUrl={v.imageUrl} onClose={() => setPreview(false)} />}
      </EditorGate>
      <p><Link className="link-arrow" to="/admin/blog">← {t('ad.blog.title')}</Link></p>
    </section>
  )
}
