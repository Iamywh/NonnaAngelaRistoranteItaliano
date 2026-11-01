import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { historyCsvHeader, parseHistoryCsv, validateHistoryRow } from '../../lib/analyticsPlanning.mjs'
import { validateMonthlyTargets } from '../../lib/analyticsTargetsValidation.mjs'

const currentMonth = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit'
}).format(new Date())
const euro = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const emptyHistory = () => ({
  month: '', revenue: '', covers: '', tax_basis: '', data_quality: '',
  source_note: '', notes: ''
})
const emptyTargets = () => ({
  revenue_target: '', covers_target: '', ticket_target: '', expense_ceiling: '',
  food_cost_ceiling_pct: '', beverage_cost_ceiling_pct: '',
  revenue_basis: '', expense_basis: '', notes: ''
})
const historicalInputStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 12 }
const goalFields = [
  ['revenue_target', 'Objetivo de facturación (€)'],
  ['covers_target', 'Objetivo de comensales'],
  ['ticket_target', 'Ticket medio objetivo (€)'],
  ['expense_ceiling', 'Presupuesto máximo gastos (€)'],
  ['food_cost_ceiling_pct', 'Coste máximo de alimentos (%)'],
  ['beverage_cost_ceiling_pct', 'Coste máximo de bebidas (%)']
]
function BasisSelector({ value, onChange, disabled, label }) {
  return <label>{label}
    <select required value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      <option value="">Seleccionar base fiscal</option>
      <option value="gross">Bruto (IGIC incluido si aplica)</option>
      <option value="net">Neto (sin IGIC)</option>
    </select>
  </label>
}

export function HistoryRegister() {
  const [form, setForm] = useState(emptyHistory)
  const [records, setRecords] = useState([])
  const [csvRows, setCsvRows] = useState([])
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const { data, error: readError } = await supabase.from('analytics_monthly_history')
        .select('month_start,revenue_total,covers,tax_basis,data_quality,source_note,notes,updated_at')
        .order('month_start', { ascending: false }).limit(120)
      if (!active) return
      setLoading(false)
      if (readError) setError('No se pudo leer el histórico: ' + readError.message)
      else setRecords(data || [])
    }
    load()
    return () => { active = false }
  }, [refresh])

  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const importRows = async rows => {
    setError('')
    setMessage('')
    if (!rows.length) return setError('No hay meses para importar.')
    const existingMonths = rows.filter(r => records.some(x => x.month_start === r.month + '-01'))
    if (existingMonths.length && !replaceExisting) {
      return setError('Ya existen: ' + existingMonths.map(x => x.month).join(', ') +
        '. Activa sustitución explícita solo si quieres sobrescribirlos.')
    }
    if (replaceExisting && !window.confirm('Vas a sustituir los meses existentes de este lote. ¿Confirmas? Se conservará auditoría de los cambios.')) return
    setSaving(true)
    const { data, error: saveError } = await supabase.rpc('analytics_import_monthly_history', {
      p_rows: rows, p_replace: replaceExisting
    })
    setSaving(false)
    if (saveError) { setError('Error al importar: ' + saveError.message); return }
    setForm(emptyHistory())
    setCsvRows([])
    setReplaceExisting(false)
    setMessage(data + ' mes(es) guardados. Los totales históricos nunca se suman al registro diario.')
    setRefresh(n => n + 1)
  }
  const saveSingle = event => {
    event.preventDefault()
    // Manual entries accept the local decimal comma; CSV keeps its explicit dot-decimal format.
    const parsed = validateHistoryRow({ ...form, revenue: String(form.revenue).trim().replace(',', '.') })
    if (parsed.errors.length) { setError(parsed.errors.join('; ')); return }
    importRows([parsed.value])
  }
  const parseFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    setCsvRows([])
    setError('')
    setMessage('')
    if (!file) return
    if (file.size > 200000) return setError('El CSV supera los 200 KB.')
    try {
      const rows = parseHistoryCsv(await file.text())
      setCsvRows(rows)
      setMessage('CSV validado en el navegador: ' + rows.length + ' meses. Revisa la vista previa antes de importar.')
    } catch (e) { setError(e.message) }
  }
  const edit = row => {
    setForm({
      month: row.month_start.slice(0, 7), revenue: String(row.revenue_total),
      covers: row.covers == null ? '' : String(row.covers),
      tax_basis: row.tax_basis, data_quality: row.data_quality,
      source_note: row.source_note, notes: row.notes || ''
    })
    setCsvRows([])
    setReplaceExisting(false)
    setMessage('Mes cargado para revisión. Para reemplazarlo debes activar la casilla de sustitución.')
    setError('')
  }

  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="dashboard-panel">
      <h3>Histórico mensual</h3>
      <p>Introduce el total completo del mes tomado de caja, informes o contabilidad.
        Si es aproximado, márcalo como estimado. Nunca añadiremos este importe
        a las ventas registradas día a día.</p>
      <p>Entrada manual: admite coma o punto decimal. Los comensales deben ser enteros.</p>
      <form onSubmit={saveSingle} style={{ display: 'grid', gap: 12 }}>
        <div style={historicalInputStyle}>
          <label>Mes
            <input required type="month" value={form.month} disabled={saving}
              onChange={e => update('month', e.target.value)} />
          </label>
          <label>Facturación del mes (€)
            <input required type="text" inputMode="decimal" value={form.revenue}
              disabled={saving} onChange={e => update('revenue', e.target.value)} />
          </label>
          <label>Comensales (opcional)
            <input type="text" inputMode="numeric" value={form.covers} disabled={saving}
              onChange={e => update('covers', e.target.value)} />
          </label>
          <BasisSelector value={form.tax_basis} disabled={saving}
            label="Base fiscal del importe" onChange={value => update('tax_basis', value)} />
          <label>Calidad del dato
            <select required value={form.data_quality} disabled={saving}
              onChange={e => update('data_quality', e.target.value)}>
              <option value="">Seleccionar</option>
              <option value="verified">Verificado — respaldo documental</option>
              <option value="estimated">Estimación — todavía no verificado</option>
            </select>
          </label>
        </div>
        <label>Fuente / respaldo obligatorio
          <input required minLength={3} maxLength={500} value={form.source_note}
            disabled={saving} placeholder="Ej.: cierre de caja octubre 2026"
            onChange={e => update('source_note', e.target.value)} />
        </label>
        <label>Notas
          <textarea maxLength={1500} rows={2} value={form.notes}
            disabled={saving} onChange={e => update('notes', e.target.value)} />
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
          <input type="checkbox" checked={replaceExisting} disabled={saving}
            onChange={e => setReplaceExisting(e.target.checked)} />
          <span>Sustituir explícitamente los meses que ya existan (con auditoría).</span>
        </label>
        <button className="primary-button" type="submit" disabled={saving || loading}>
          {saving ? 'Guardando…' : 'Guardar mes'}
        </button>
      </form>
    </div>
    <div className="dashboard-panel">
      <h3>Importar varios meses (CSV)</h3>
      <p>Archivo UTF-8 separado por punto y coma o coma. Usa punto decimal, incluso en España.
        Campos vacíos para comensales o notas desconocidas. Máximo 60 meses.</p>
      <p><strong>Columnas obligatorias:</strong> <code>{historyCsvHeader}</code></p>
      <button type="button" className="ghost-button" onClick={() => {
        const example = historyCsvHeader + '\n'
        const blob = new Blob([example], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'plantilla_historico_nonna_angela.csv'
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      }}>Descargar plantilla CSV (solo cabecera)</button>
      <label>Seleccionar CSV
        <input type="file" accept=".csv,text/csv" disabled={saving} onChange={parseFile} />
      </label>
      {csvRows.length > 0 && <>
        <h4>Vista previa: {csvRows.length} mes(es)</h4>
        <div style={{ maxHeight: 240, overflow: 'auto' }}>
          <table style={{ width: '100%' }}>
            <thead><tr><th>Mes</th><th>Ingresos</th><th>Tipo</th><th>Fiscal</th></tr></thead>
            <tbody>{csvRows.map(row => <tr key={row.month}>
              <td>{row.month}</td><td>{euro(row.revenue)}</td>
              <td>{row.data_quality === 'verified' ? 'Verificado' : 'Estimación'}</td>
              <td>{row.tax_basis}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <button type="button" className="primary-button" disabled={saving || loading}
          onClick={() => importRows(csvRows)}>Confirmar importación de {csvRows.length} mes(es)</button>
      </>}
      {error && <p className="manager-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
    <div className="dashboard-panel">
      <h3>Meses guardados</h3>
      {loading ? <p>Cargando histórico…</p> : records.length === 0 ?
        <p>No hay datos históricos importados.</p> :
        <div style={{ display: 'grid', gap: 8 }}>
          {records.map(row => <div key={row.month_start}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
              flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid rgba(128,128,128,.25)' }}>
            <div><strong>{row.month_start.slice(0, 7)} · {euro(row.revenue_total)}</strong>
              <p>{row.data_quality === 'verified' ? 'Verificado' : 'Estimado'} ·
                {row.tax_basis === 'gross' ? ' Bruto' : ' Neto'} · {row.source_note}</p></div>
            <button type="button" className="ghost-button" onClick={() => edit(row)}
              disabled={saving}>Editar</button>
          </div>)}
        </div>}
    </div>
  </div>
}

export function MonthlyGoals() {
  const [month, setMonth] = useState(currentMonth)
  const [form, setForm] = useState(emptyTargets)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    let active = true
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return
    const load = async () => {
      setLoading(true)
      setError('')
      setMessage('')
      setFieldErrors({})
      const { data, error: readError } = await supabase.from('analytics_monthly_targets')
        .select('month_start,revenue_target,covers_target,ticket_target,expense_ceiling,food_cost_ceiling_pct,beverage_cost_ceiling_pct,revenue_basis,expense_basis,notes')
        .eq('month_start', month + '-01').maybeSingle()
      if (!active) return
      if (readError) setError('No se pudieron cargar los objetivos: ' + readError.message)
      else setForm(data ? Object.fromEntries(Object.keys(emptyTargets()).map(k =>
        [k, data[k] == null ? '' : String(data[k])])) : emptyTargets())
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [month, revision])

  const changeGoal = (key, value) => {
    setForm(previous => ({ ...previous, [key]: value }))
    setFieldErrors(previous => ({ ...previous, [key]: undefined }))
    setError('')
    setMessage('')
  }

  const save = async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    const result = validateMonthlyTargets(form, month)
    setFieldErrors(result.errors)
    if (!result.isValid) {
      const first = Object.entries(result.errors)[0]
      setError((result.labels[first[0]] ? result.labels[first[0]] + ': ' : '') + first[1])
      return
    }

    setSaving(true)
    const args = {
      p_month_start: month + '-01',
      ...Object.fromEntries(goalFields.map(([key]) => ['p_' + key, result.values[key]])),
      p_revenue_basis: form.revenue_basis,
      p_expense_basis: form.expense_basis,
      p_notes: form.notes.trim() || null
    }
    const { error: writeError } = await supabase.rpc('analytics_save_monthly_target', args)
    setSaving(false)
    if (writeError) { setError('No se pudieron guardar los objetivos: ' + writeError.message); return }
    setMessage('Objetivos guardados y auditados en Supabase.')
    setRevision(n => n + 1)
  }
  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="dashboard-panel">
      <h3>Objetivos del mes</h3>
      <p>Establece los targets comerciales y de costes. No se rellenan valores
        automáticamente: deben ser decisiones reales de gestión.</p>
      <label>Mes
        <input type="month" value={month} disabled={saving}
          onChange={e => { setLoading(true); setMonth(e.target.value) }} />
      </label>
      {loading ? <p>Cargando objetivos…</p> :
        <form onSubmit={save} noValidate style={{ display: 'grid', gap: 12 }}>
          <p>Importes: puedes usar coma o punto decimal (ej.: 27000,01). Comensales: únicamente números enteros (ej.: 800).</p>
          <div style={historicalInputStyle}>
            {goalFields.map(([key, label]) => <label key={key}>{label}
              <input type="text"
                inputMode={key === 'covers_target' ? 'numeric' : 'decimal'}
                autoComplete="off" value={form[key]} disabled={saving}
                aria-invalid={Boolean(fieldErrors[key])}
                onChange={e => changeGoal(key, e.target.value)} />
              {fieldErrors[key] && <small role="alert" className="manager-error">{fieldErrors[key]}</small>}
            </label>)}
          </div>
          <div style={historicalInputStyle}>
            <BasisSelector label="Base fiscal de facturación" disabled={saving}
              value={form.revenue_basis}
              onChange={value => changeGoal('revenue_basis', value)} />
            <BasisSelector label="Base fiscal de gastos" disabled={saving}
              value={form.expense_basis}
              onChange={value => changeGoal('expense_basis', value)} />
          </div>
          <label>Notas / hipótesis de estos objetivos
            <textarea rows={2} maxLength={1500} value={form.notes} disabled={saving}
              onChange={e => changeGoal('notes', e.target.value)} />
          </label>
          {error && <p role="alert" className="manager-error">{error}</p>}
          {message && <p role="status">{message}</p>}
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar objetivos del mes'}
          </button>
        </form>}
    </div>
    <div className="dashboard-panel">
      <h3>Comparación con resultados</h3>
      <p>Los avances reales frente a estos objetivos se mostrarán en la pestaña
        Dashboard cuando exista un mes completo o un histórico verificado.
        Los gastos se etiquetarán como parciales hasta implementar cierre de mes.</p>
      <p>No se calculan beneficios sin gastos, impuestos y existencias reconciliados.</p>
    </div>
  </div>
}
