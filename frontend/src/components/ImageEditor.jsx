import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../lib/app.jsx'

// Before any picture is uploaded, it opens here: the person sees it, and can crop it to a shape (the original shape,
// square, 4:3, 3:2, 16:9 or portrait), move it inside the frame, zoom, turn it, mirror it, and adjust brightness, contrast
// and colour. "Use this picture" hands back a new File made from exactly what the frame shows; "Use as it is" hands back
// the original file untouched. Everything happens in the browser; nothing is uploaded until the caller does so.

const ASPECTS = [
  ['original', 'মূল আকার', 'Original', null],
  ['1:1', 'বর্গ ১:১', 'Square 1:1', 1],
  ['4:3', '৪:৩', '4:3', 4 / 3],
  ['3:2', '৩:২', '3:2', 3 / 2],
  ['16:9', '১৬:৯', '16:9', 16 / 9],
  ['3:4', 'লম্বা ৩:৪', 'Portrait 3:4', 3 / 4],
]
const MAX_SIDE = 4096 // the editor never makes a picture larger than this; the upload step makes it smaller still
const canFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype

export function editedFile(file, blob) {
  const type = blob.type || 'image/jpeg'
  const ext = type === 'image/png' ? '.png' : '.jpg'
  return new File([blob], (file.name || 'picture').replace(/\.[^.]+$/, '') + ext, { type, lastModified: Date.now() })
}

export default function ImageEditor({ file, aspect: initialAspect = 'original', aspects, maxSide = MAX_SIDE, onDone, onCancel }) {
  const { t, pick } = useApp()
  const [src, setSrc] = useState('')
  const [img, setImg] = useState(null) // { el, w, h }
  const [failed, setFailed] = useState(false)
  const [aspect, setAspect] = useState(initialAspect)
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0) // 0, 90, 180, 270
  const [flip, setFlip] = useState(false)
  const [fx, setFx] = useState({ b: 100, c: 100, s: 100 })
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [stage, setStage] = useState({ w: 520, h: 360 })
  const [busy, setBusy] = useState(false)
  const stageRef = useRef(null)
  const drag = useRef(null)
  const box = useRef(null)
  const shell = useRef(null)
  const list = ASPECTS.filter(([id]) => !aspects || aspects.includes(id))

  useEffect(() => { // made and freed together, so a remount never shows a freed address
    const u = URL.createObjectURL(file)
    setSrc(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  useEffect(() => {
    if (!src) return undefined
    const el = new Image()
    el.onload = () => setImg({ el, w: el.naturalWidth, h: el.naturalHeight })
    el.onerror = () => setFailed(true)
    el.src = src
    return () => { el.onload = null; el.onerror = null }
  }, [src])
  useLayoutEffect(() => {
    const measure = () => { const r = stageRef.current?.getBoundingClientRect(); if (r) setStage({ w: r.width, h: r.height }) }
    measure()
    const ro = new ResizeObserver(measure)
    if (stageRef.current) ro.observe(stageRef.current)
    return () => ro.disconnect()
  }, [img])
  useEffect(() => {
    const prev = document.activeElement
    // a native modal dialog sits in the browser's top layer, above any other dialog (the profile window is one too)
    const d = shell.current
    if (d && !d.open && d.showModal) d.showModal()
    const cancel = (e) => { e.preventDefault(); onCancel() }
    d?.addEventListener('cancel', cancel)
    box.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onCancel() } }
    window.addEventListener('keydown', key, true) // before any dialog underneath sees it
    return () => { d?.removeEventListener('cancel', cancel); if (d?.open) d.close(); window.removeEventListener('keydown', key, true); document.body.style.overflow = overflow; prev?.focus?.() }
  }, [onCancel])

  // the picture as turned (a quarter turn swaps width and height)
  const turned = img ? (rot % 180 ? { w: img.h, h: img.w } : { w: img.w, h: img.h }) : { w: 1, h: 1 }
  const ratio = ASPECTS.find((a) => a[0] === aspect)?.[3] || turned.w / turned.h
  // the frame: as large as the stage allows, in the chosen shape, with a little room around it
  const room = { w: Math.max(80, stage.w - 32), h: Math.max(80, stage.h - 32) }
  const frame = room.w / room.h > ratio ? { w: room.h * ratio, h: room.h } : { w: room.w, h: room.w / ratio }
  const base = Math.max(frame.w / turned.w, frame.h / turned.h) // the smallest size that still fills the frame
  const scale = base * zoom
  const clamp = useCallback((o, s = scale) => {
    const mx = Math.max(0, (turned.w * s - frame.w) / 2)
    const my = Math.max(0, (turned.h * s - frame.h) / 2)
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) }
  }, [turned.w, turned.h, frame.w, frame.h, scale])
  useEffect(() => { setOff((o) => clamp(o)) }, [clamp])

  const filter = `brightness(${fx.b}%) contrast(${fx.c}%) saturate(${fx.s}%)`
  const changed = aspect !== 'original' || zoom !== 1 || rot || flip || off.x || off.y || fx.b !== 100 || fx.c !== 100 || fx.s !== 100

  const down = (e) => { if (!img) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, o: off } }
  const move = (e) => { const d = drag.current; if (d) setOff(clamp({ x: d.o.x + e.clientX - d.x, y: d.o.y + e.clientY - d.y })) }
  const up = () => { drag.current = null }
  const wheel = (e) => { if (!img) return; setZoom((z) => Math.min(4, Math.max(1, +(z - e.deltaY * 0.0015).toFixed(3)))) }
  const nudge = (e) => {
    const step = e.shiftKey ? 30 : 8
    const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
    if (d) { e.preventDefault(); setOff((o) => clamp({ x: o.x + d[0], y: o.y + d[1] })) }
  }
  const reset = () => { setAspect('original'); setZoom(1); setRot(0); setFlip(false); setOff({ x: 0, y: 0 }); setFx({ b: 100, c: 100, s: 100 }) }

  const apply = async () => {
    if (!img) return
    if (!changed) { onDone(file); return }
    setBusy(true)
    try {
      // the frame, in the picture's own pixels
      let w = frame.w / scale
      let h = frame.h / scale
      const k = Math.min(1, maxSide / Math.max(w, h))
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k))
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')
      const png = file.type === 'image/png'
      if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) }
      if (canFilter) ctx.filter = filter
      const s = k // picture pixels → canvas pixels
      ctx.translate(w / 2 + (off.x / scale) * s, h / 2 + (off.y / scale) * s)
      ctx.rotate((rot * Math.PI) / 180)
      if (flip) ctx.scale(-1, 1)
      ctx.drawImage(img.el, (-img.w / 2) * s, (-img.h / 2) * s, img.w * s, img.h * s)
      const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), png ? 'image/png' : 'image/jpeg', 0.92))
      onDone(editedFile(file, blob))
    } catch { setBusy(false); setFailed(true) }
  }

  const cx = stage.w / 2 + off.x
  const cy = stage.h / 2 + off.y
  const imgStyle = img ? {
    width: img.w * scale, height: img.h * scale, left: cx - (img.w * scale) / 2, top: cy - (img.h * scale) / 2,
    transform: `rotate(${rot}deg)${flip ? ' scaleX(-1)' : ''}`, filter,
  } : undefined
  const slider = (label, value, set, min, max) => (
    <label className="ie-slider"><span>{label}<b>{value}%</b></span><input type="range" min={min} max={max} value={value} onChange={(e) => set(+e.target.value)} /></label>
  )

  return createPortal(
    <dialog className="ie" ref={shell} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div className="ie-box" role="dialog" aria-modal="true" aria-label={t('editor.previewAndAdjustThe')} tabIndex={-1} ref={box}>
        <header className="ie-head">
          <h2>{t('editor.previewAndAdjustThe')}</h2>
          <button type="button" className="ie-x" onClick={onCancel} aria-label={t('editor.cancel')} disabled={busy}>✕</button>
        </header>
        <div className="ie-body">
          <div className={`ie-stage${img ? '' : ' is-loading'}`} ref={stageRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
            tabIndex={0} onKeyDown={nudge} aria-label={t('editor.dragOrUseThe')}>
            {failed ? <p className="ie-fail">{t('editor.thisPictureCouldNot')}</p>
              : img && <img className="ie-img" src={src} alt="" draggable={false} style={imgStyle} />}
            {img && <span className="ie-frame" style={{ width: frame.w, height: frame.h }} aria-hidden="true"><i /><i /></span>}
          </div>
          <div className="ie-tools">
            <div className="ie-group" role="group" aria-label={t('editor.shape')}>
              <span className="ie-label">{t('editor.shapeCrop')}</span>
              <div className="ie-chips">
                {list.map(([id, bn, en]) => <button key={id} type="button" className={aspect === id ? 'on' : ''} aria-pressed={aspect === id} onClick={() => { setAspect(id); setZoom(1); setOff({ x: 0, y: 0 }) }}>{pick(bn, en)}</button>)}
              </div>
            </div>
            <label className="ie-slider"><span>{t('editor.zoom')}<b>{Math.round(zoom * 100)}%</b></span>
              <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
            <div className="ie-row">
              <button type="button" onClick={() => { setRot((r) => (r + 270) % 360); setOff({ x: 0, y: 0 }) }} aria-label={t('editor.turnLeft')}>⟲ {t('editor.left')}</button>
              <button type="button" onClick={() => { setRot((r) => (r + 90) % 360); setOff({ x: 0, y: 0 }) }} aria-label={t('editor.turnRight')}>⟳ {t('editor.right')}</button>
              <button type="button" aria-pressed={flip} className={flip ? 'on' : ''} onClick={() => setFlip((f) => !f)}>⇋ {t('editor.mirror')}</button>
            </div>
            {canFilter && (
              <details className="ie-more">
                <summary>{t('editor.lightAndColour')}</summary>
                {slider(t('editor.brightness'), fx.b, (b) => setFx({ ...fx, b }), 50, 150)}
                {slider(t('editor.contrast'), fx.c, (c) => setFx({ ...fx, c }), 50, 150)}
                {slider(t('editor.colour'), fx.s, (s) => setFx({ ...fx, s }), 0, 200)}
              </details>
            )}
            <p className="ie-hint">{t('editor.dragThePictureTo')}</p>
            {changed && <button type="button" className="ie-reset" onClick={reset}>{t('editor.reset')}</button>}
          </div>
        </div>
        <footer className="ie-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDone(file)} disabled={busy || failed}>{t('editor.useAsItIs')}</button>
          <button type="button" className="btn btn-dark btn-sm" onClick={apply} disabled={busy || !img}>{busy ? t('editor.preparing') : t('editor.useThisPicture')}</button>
        </footer>
      </div>
    </dialog>,
    document.body,
  )
}

// useImageEditor: const [edit, editor] = useImageEditor({ aspect: '1:1' }); … const f = await edit(file) (null when
// cancelled); render {editor} somewhere in the component.
export function useImageEditor(options = {}) {
  const [job, setJob] = useState(null)
  const edit = useCallback((file) => new Promise((resolve) => setJob({ file, resolve })), [])
  const finish = useCallback((f) => { setJob((j) => { j?.resolve(f); return null }) }, [])
  const cancel = useCallback(() => finish(null), [finish])
  const editor = job ? <ImageEditor key={job.file.name + job.file.size} file={job.file} {...options} onDone={finish} onCancel={cancel} /> : null
  return [edit, editor]
}
