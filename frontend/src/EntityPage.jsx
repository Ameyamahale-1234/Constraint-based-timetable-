import { useState } from 'react'

const blank = (fields) => Object.fromEntries(fields.map((f) => [f.key, f.type === 'select' ? f.options[0] : '']))

export default function EntityPage({ entity, rows, setRows }) {
  const { title, fields, hint } = entity
  const [form, setForm] = useState(blank(fields))
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const missing = fields.filter((f) => !f.optional && String(form[f.key] ?? '').trim() === '')
    if (missing.length) {
      setError('Please fill: ' + missing.map((f) => f.label).join(', ') + '.')
      return
    }
    const clean = { ...form }
    fields.forEach((f) => { if (f.type === 'number' && clean[f.key] !== '') clean[f.key] = Number(clean[f.key]) })
    if (editId) setRows(rows.map((r) => (r.id === editId ? { ...clean, id: editId } : r)))
    else setRows([...rows, { ...clean, id: Date.now() }])
    setForm(blank(fields)); setEditId(null); setError('')
  }

  const edit = (r) => { setForm({ ...blank(fields), ...r }); setEditId(r.id); setError('') }
  const remove = (id) => setRows(rows.filter((r) => r.id !== id))
  const removeAll = () => { if (window.confirm(`Delete all ${rows.length} ${title.toLowerCase()} records?`)) setRows([]) }
  const q = query.trim().toLowerCase()
  const shown = q ? rows.filter((r) => fields.some((f) => String(r[f.key] ?? '').toLowerCase().includes(q))) : rows

  return (
    <div>
      <h2>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      <form className="form" onSubmit={submit}>
        {fields.map((f) => (
          <label key={f.key}>
            {f.label}{f.optional && <small style={{ fontWeight: 400 }}> (optional)</small>}
            {f.type === 'select' ? (
              <select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
        <button type="submit">{editId ? 'Update' : 'Add'}</button>
        {editId && <button type="button" className="ghost" onClick={() => { setForm(blank(fields)); setEditId(null) }}>Cancel</button>}
      </form>
      {error && <p className="error">{error}</p>}
      <div className="entity-bar">
        <input placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted">{shown.length} of {rows.length} record(s)</span>
        {rows.length > 0 && <button type="button" className="danger" onClick={removeAll}>Delete all</button>}
      </div>
      <table>
        <thead>
          <tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}<th></th></tr>
        </thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={fields.length + 1} className="empty">{rows.length ? 'No records match the search.' : 'No records yet. Add one above, or import an Excel workbook on the Generate Timetable page.'}</td></tr>}
          {shown.map((r) => (
            <tr key={r.id}>
              {fields.map((f) => <td key={f.key} className={f.key === 'faculty' && !r[f.key] ? 'missing' : ''}>{r[f.key] === '' || r[f.key] == null ? (f.optional ? '—' : 'missing') : r[f.key]}</td>)}
              <td className="actions">
                <button className="ghost" onClick={() => edit(r)}>Edit</button>
                <button className="danger" onClick={() => remove(r.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
