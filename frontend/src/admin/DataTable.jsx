import { useApp } from '../lib/app.jsx'

// One table for every admin list. Column widths are deliberate (table-layout: fixed), long text wraps at word
// boundaries or is cut with an ellipsis plus the full value in a tooltip, and below ~720px of *container* width
// (not viewport width, so the sidebar cannot squeeze it) each row becomes a card with the column labels shown.
//
// columns: [{ id, label | srLabel, width, className, primary, cell(row) }]
// selection: { picked, toggle(id), allOn, toggleAll() } (optional)
export default function DataTable({ columns, rows, rowKey, selection, caption, rowClass }) {
  const { t } = useApp()
  return (
    <div className="dt-wrap">
      <table className="dt">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {selection && <col style={{ width: 44 }} />}
          {columns.map((c) => <col key={c.id} style={c.width ? { width: c.width } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {selection && (
              <th scope="col" className="dt-sel"><input type="checkbox" checked={selection.allOn} onChange={selection.toggleAll} aria-label={t('ad.selectAll')} /></th>
            )}
            {columns.map((c) => (
              <th key={c.id} scope="col" className={c.className}>{c.label || <span className="sr-only">{c.srLabel}</span>}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const id = rowKey(r)
            const on = selection?.picked.includes(id)
            return (
              <tr key={id} className={`${rowClass ? rowClass(r) : ''} ${on ? 'is-selected' : ''}`}>
                {selection && (
                  <td className="dt-sel" data-label="">
                    <input type="checkbox" checked={!!on} onChange={() => selection.toggle(id)} aria-label={`${t('ad.select')} ${selection.name ? selection.name(r) : ''}`} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.id} data-label={c.label || ''} className={`${c.className || ''} ${c.primary ? 'dt-main' : ''}`}>{c.cell(r)}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// A single line that is cut with an ellipsis; the complete text stays available as a tooltip.
export function Trunc({ children, className = '' }) {
  return <span className={`dt-trunc ${className}`} title={typeof children === 'string' ? children : undefined}>{children}</span>
}
