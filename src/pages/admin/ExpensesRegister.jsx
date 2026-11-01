import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

// Use identical category keys as the database CHECK constraint.
const CATEGORIES = [
  ['food_purchases', 'Compras de alimentos'],
  ['beverage_purchases', 'Compras de bebidas'],
  ['payroll', 'Personal y nóminas'],
  ['rent', 'Alquiler'],
  ['utilities', 'Agua, luz y suministros'],
  ['marketing', 'Marketing'],
  ['cleaning_supplies', 'Limpieza y consumibles'],
  ['packaging', 'Embalajes'],
  ['maintenance', 'Mantenimiento'],
  ['professional_services', 'Servicios profesionales'],
  ['bank_fees', 'Comisiones bancarias'],
  ['other', 'Otros gastos']
]
const categoryName = Object.fromEntries(CATEGORIES)
const money = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
const canaryToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date())
const blank = () => ({ category: 'food_purchases', amount: '', tax_basis: 'gross', igic_amount: '', notes: '' })

export default function ExpensesRegister() {
  const [periodKind, setPeriodKind] = useState('daily')
  const [day, setDay] = useState(canaryToday)
  const [month, setMonth] = useState(() => canaryToday().slice(0, 7))
  const [entry, setEntry] = useState(blank)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const periodDate = periodKind === 'daily' ? day : month + '-01'
  const editing = rows.some(r => r.category === entry.category)
  const formLocked = loading || saving || !periodDate

  useEffect(() => {
    let valid = true
    const load = async () => {
      setLoading(true)
      setRows([])
      setError('')
      const { data, error: loadError } = await supabase
        .from('analytics_expenses')
        .select('id,period_kind,period_date,category,amount,tax_basis,igic_amount,notes,updated_at')
        .eq('period_kind', periodKind)
        .eq('period_date', periodDate)
        .order('category', { ascending: true })
      if (!valid) return
      if (loadError) setError('No se pudieron cargar los gastos: ' + loadError.message)
      else setRows(data || [])
      setLoading(false)
    }
    if (periodDate) load()
    else { setRows([]); setLoading(false) }
    return () => { valid = false }
  }, [periodKind, periodDate, refresh])

  const total = useMemo(() => rows.reduce((acc, r) => acc + Number(r.amount), 0), [rows])
  const mixedBasis = new Set(rows.map(r => r.tax_basis)).size > 1

  const changePeriod = kind => {
    setPeriodKind(kind)
    setEntry(blank())
    setError('')
    setMessage('')
  }
  const update = (field, value) => setEntry(prev => ({ ...prev, [field]: value }))
  const editRow = row => {
    setEntry({
      category: row.category,
      amount: String(row.amount),
      tax_basis: row.tax_basis,
      igic_amount: row.igic_amount == null ? '' : String(row.igic_amount),
      notes: row.notes || ''
    })
    setMessage('Editando: ' + categoryName[row.category])
    setError('')
  }
  const save = async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    const amount = Number(entry.amount)
    const igic = entry.igic_amount.trim() === '' ? null : Number(entry.igic_amount)
    if (!entry.amount.trim() || !Number.isFinite(amount) || amount <= 0 ||
        Math.round(amount * 100) !== amount * 100 && Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7 ||
        (igic !== null && (!Number.isFinite(igic) || igic < 0 || (entry.tax_basis === 'gross' && igic > amount)))) {
      setError('Introduce importes positivos válidos. El IGIC indicado no puede superar el total bruto.')
      return
    }
    if (editing && !window.confirm('Ya existe un registro de esta categoría en este período. ¿Quieres sustituir sus importes? Se guardará un historial de cambios.')) return

    setSaving(true)
    const { error: saveError } = await supabase.rpc('analytics_upsert_expense', {
      p_period_kind: periodKind, p_period_date: periodDate, p_category: entry.category,
      p_amount: amount, p_tax_basis: entry.tax_basis,
      p_igic_amount: igic, p_notes: entry.notes.trim() || null
    })
    setSaving(false)
    if (saveError) { setError('No se pudo guardar: ' + saveError.message); return }
    setEntry(blank())
    setMessage('Gasto guardado en Supabase. Los cambios quedan registrados en el historial.')
    setRefresh(n => n + 1)
  }

  const remove = async row => {
    if (!window.confirm('¿Eliminar ' + categoryName[row.category] + ' de este período? La operación quedará registrada en el historial.')) return
    setSaving(true)
    setError('')
    setMessage('')
    const { data, error: deleteError } = await supabase.rpc('analytics_delete_expense', { p_id: row.id })
    setSaving(false)
    if (deleteError || data !== true) {
      setError('No se pudo eliminar: ' + (deleteError?.message || 'Registro no encontrado'))
      return
    }
    setEntry(blank())
    setMessage('Registro eliminado. Se conserva una copia en el historial de auditoría.')
    setRefresh(n => n + 1)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="dashboard-panel">
        <h3>Gastos</h3>
        <p>Registra importes por categoría, no facturas individuales. No dupliques una misma factura como gasto diario y coste fijo mensual.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <button type="button" className={periodKind === 'daily' ? 'primary-button' : 'ghost-button'} onClick={() => changePeriod('daily')}>Gastos diarios</button>
          <button type="button" className={periodKind === 'monthly' ? 'primary-button' : 'ghost-button'} onClick={() => changePeriod('monthly')}>Costes fijos mensuales</button>
        </div>
        {periodKind === 'daily' ?
          <label>Fecha <input type="date" value={day} disabled={saving} onChange={e => { setDay(e.target.value); setEntry(blank()); setMessage('') }} /></label> :
          <label>Mes <input type="month" value={month} disabled={saving} onChange={e => { setMonth(e.target.value); setEntry(blank()); setMessage('') }} /></label>
        }
        <p><strong>Total registrado: {money(total)}</strong></p>
        {mixedBasis && <p role="alert">Atención: este total combina importes con IGIC incluido y sin IGIC. No lo uses como coste contable neto.</p>}
        <p>Los pagos de alimentos y bebidas son compras, no consumo real de inventario. El coste de ventas se calculará después con existencias.</p>
      </div>

      <div className="dashboard-panel">
        <h3>{editing ? 'Modificar gasto' : 'Añadir gasto'}</h3>
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <label>Categoría
            <select value={entry.category} disabled={formLocked} onChange={e => update('category', e.target.value)}>
              {CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>Importe (€)
            <input type="number" required min="0.01" step="0.01" value={entry.amount}
              disabled={formLocked} onChange={e => update('amount', e.target.value)} />
          </label>
          <label>Tratamiento IGIC
            <select value={entry.tax_basis} disabled={formLocked} onChange={e => update('tax_basis', e.target.value)}>
              <option value="gross">Importe bruto (IGIC incluido, si aplica)</option>
              <option value="net">Importe neto (IGIC no incluido)</option>
            </select>
          </label>
          <label>IGIC conocido (€) — opcional
            <input type="number" min="0" step="0.01" value={entry.igic_amount}
              disabled={formLocked} placeholder="Sin desglose verificado"
              onChange={e => update('igic_amount', e.target.value)} />
          </label>
          <label>Notas (proveedor, concepto, referencia)
            <textarea maxLength="2000" rows={2} value={entry.notes}
              disabled={formLocked} onChange={e => update('notes', e.target.value)} />
          </label>
          {editing && <p>Ya existe un total para esta categoría en este período. Al guardar lo sustituirás, no lo sumarás.</p>}
          {error && <p role="alert" className="manager-error">{error}</p>}
          {message && <p role="status">{message}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button type="submit" className="primary-button" disabled={formLocked}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar gasto'}</button>
            <button type="button" className="ghost-button" disabled={saving} onClick={() => { setEntry(blank()); setMessage(''); setError('') }}>Limpiar formulario</button>
          </div>
        </form>
      </div>

      <div className="dashboard-panel">
        <h3>{periodKind === 'daily' ? 'Gastos del día' : 'Costes fijos del mes'}</h3>
        {loading ? <p>Cargando…</p> : rows.length === 0 ? <p>No hay gastos registrados para este período.</p> :
          <div style={{ display: 'grid', gap: 12 }}>
            {rows.map(row => <div key={row.id} style={{ borderBottom: '1px solid rgba(128,128,128,.25)', paddingBottom: 12 }}>
              <p><strong>{categoryName[row.category] || row.category}</strong> — {money(row.amount)}</p>
              <p>{row.tax_basis === 'gross' ? 'Bruto' : 'Neto'} · IGIC: {row.igic_amount == null ? 'Sin desglose' : money(row.igic_amount)}</p>
              {row.notes && <p>{row.notes}</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" className="ghost-button" disabled={saving} onClick={() => editRow(row)}>Editar</button>
                <button type="button" className="ghost-button" disabled={saving} onClick={() => remove(row)}>Eliminar</button>
              </div>
            </div>)}
          </div>
        }
      </div>
    </div>
  )
}
