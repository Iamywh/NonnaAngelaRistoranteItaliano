import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

const money = amount => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR'
}).format(amount)
const currentMonthCanary = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit'
}).format(new Date())
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const VALUATION_RE = /^\d+(?:\.\d{1,2})?$/
const ADJUSTMENT_RE = /^-?\d+(?:\.\d{1,2})?$/
const TYPES = [
  { key: 'food', label: 'Alimentos', expense: 'food_purchases' },
  { key: 'beverage', label: 'Bebidas', expense: 'beverage_purchases' }
]
const empty = () => ({
  opening_value: '', closing_value: '', external_adjustment: '0',
  valuation_basis: 'gross', purchases_reconciled: false, notes: ''
})
const dateAfterMonth = month => {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10)
}
const normalize = record => ({
  opening_value: record.opening_value == null ? '' : String(record.opening_value),
  closing_value: record.closing_value == null ? '' : String(record.closing_value),
  external_adjustment: String(record.external_adjustment ?? 0),
  valuation_basis: record.valuation_basis || 'gross',
  purchases_reconciled: Boolean(record.purchases_reconciled),
  notes: record.notes || ''
})

function InventoryCard({ type, entry, purchases, loading, saving, onChange, onSave }) {
  const purchasesByBasis = new Set(purchases.map(item => item.tax_basis))
  const purchaseKinds = new Set(purchases.map(item => item.period_kind))
  const totalPurchases = purchases.reduce((sum, item) => sum + Number(item.amount), 0)
  const duplicateRisk = purchaseKinds.size > 1
  const taxMismatch = [...purchasesByBasis].some(basis => basis !== entry.valuation_basis)
  const incompleteValues = entry.opening_value === '' || entry.closing_value === ''
  const numeric = [entry.opening_value, entry.closing_value, entry.external_adjustment]
    .every(value => value === '' || Number.isFinite(Number(value)))
  const estimated = Number(entry.opening_value) + totalPurchases
    + Number(entry.external_adjustment) - Number(entry.closing_value)
  const canCalculate = !loading && Boolean(entry.purchases_reconciled)
    && !incompleteValues && numeric && !duplicateRisk && !taxMismatch
    && estimated >= 0

  let explanation = ''
  if (loading) explanation = 'Cargando compras del período…'
  else if (!entry.purchases_reconciled) explanation = 'Compras pendientes de comprobar. Confirma todos los gastos de compras del mes antes de calcular.'
  else if (incompleteValues) explanation = 'Falta inventario inicial o final. Una casilla vacía no equivale a cero.'
  else if (duplicateRisk) explanation = 'Hay compras registradas en gastos diarios y mensuales de esta categoría. Revisa posibles duplicidades antes de calcular.'
  else if (taxMismatch) explanation = 'La base fiscal de las compras no coincide con la valoración del inventario. Regulariza los importes antes de calcular.'
  else if (estimated < 0) explanation = 'El consumo calculado es negativo. Comprueba valores, ajustes y compras; no se mostrará como un consumo válido.'

  return (
    <div className="dashboard-panel">
      <h3>Inventario de {type.label.toLowerCase()}</h3>
      <p>Compras del mes registradas en Gastos: <strong>{money(totalPurchases)}</strong> ({purchases.length} registro/s)</p>
      <p>Los importes se leen de Gastos; aquí no vuelvas a introducirlos.</p>
      <form onSubmit={event => { event.preventDefault(); onSave(type.key) }}
        style={{ display: 'grid', gap: 12 }}>
        <label>Inventario inicial (€)
          <input type="number" min="0" step="0.01" placeholder="Sin registrar"
            value={entry.opening_value} disabled={saving || loading}
            onChange={event => onChange(type.key, 'opening_value', event.target.value)} />
        </label>
        <label>Inventario final (€)
          <input type="number" min="0" step="0.01" placeholder="Sin registrar"
            value={entry.closing_value} disabled={saving || loading}
            onChange={event => onChange(type.key, 'closing_value', event.target.value)} />
        </label>
        <label>Ajustes externos de existencias (€), con signo
          <input type="number" step="0.01" value={entry.external_adjustment}
            disabled={saving || loading}
            onChange={event => onChange(type.key, 'external_adjustment', event.target.value)} />
        </label>
        <p>Solo movimientos de stock ajenos a compras y consumo: positivo = entrada, negativo = salida externa. No incluyas mermas ya reflejadas en el inventario final.</p>
        <label>Base de valoración
          <select value={entry.valuation_basis} disabled={saving || loading}
            onChange={event => onChange(type.key, 'valuation_basis', event.target.value)}>
            <option value="gross">Bruto (IGIC incluido cuando corresponda)</option>
            <option value="net">Neto (sin IGIC)</option>
          </select>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
          <input type="checkbox" checked={entry.purchases_reconciled}
            disabled={saving || loading}
            onChange={event => onChange(type.key, 'purchases_reconciled', event.target.checked)} />
          <span>He comprobado que las compras de esta categoría y mes están completas en Gastos, incluso si son 0 €.</span>
        </label>
        <label>Notas de valoración (máx. 2.000 caracteres)
          <textarea rows={2} maxLength={2000} value={entry.notes}
            disabled={saving || loading}
            onChange={event => onChange(type.key, 'notes', event.target.value)} />
        </label>
        {canCalculate
          ? <div>
              <strong>Consumo estimado: {money(estimated)}</strong>
              <p>Inventario inicial + compras + ajustes externos − inventario final.</p>
            </div>
          : <p role="status">{explanation || 'Introduce una valoración válida para calcular el consumo.'}</p>}
        <button type="submit" className="primary-button" disabled={saving || loading}>
          {saving ? 'Guardando…' : 'Guardar inventario'}
        </button>
      </form>
    </div>
  )
}

export default function MonthlyInventory() {
  const [month, setMonth] = useState(currentMonthCanary)
  const [records, setRecords] = useState({ food: empty(), beverage: empty() })
  const [purchaseRows, setPurchaseRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const monthStart = MONTH_RE.test(month) ? month + '-01' : null
  const monthEnd = monthStart ? dateAfterMonth(month) : null
  const purchases = useMemo(() => ({
    food: purchaseRows.filter(row => row.category === 'food_purchases'),
    beverage: purchaseRows.filter(row => row.category === 'beverage_purchases')
  }), [purchaseRows])
  useEffect(() => {
    if (!monthStart) {
      setLoading(false)
      setError('Selecciona un mes válido.')
      return
    }
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      setMessage('')
      const [inventoryResult, expensesResult] = await Promise.all([
        supabase.from('analytics_monthly_inventory')
          .select('stock_type,opening_value,closing_value,external_adjustment,valuation_basis,purchases_reconciled,notes')
          .eq('month_start', monthStart),
        supabase.from('analytics_expenses')
          .select('period_kind,period_date,category,amount,tax_basis')
          .in('category', ['food_purchases', 'beverage_purchases'])
          .gte('period_date', monthStart).lt('period_date', monthEnd)
          .limit(1000)
      ])
      if (!active) return
      if (inventoryResult.error || expensesResult.error) {
        setError('No se pudieron cargar inventarios o compras: ' +
          (inventoryResult.error?.message || expensesResult.error?.message))
        setPurchaseRows([])
        setRecords({ food: empty(), beverage: empty() })
      } else {
        const next = { food: empty(), beverage: empty() }
        for (const row of inventoryResult.data || []) {
          if (next[row.stock_type]) next[row.stock_type] = normalize(row)
        }
        setRecords(next)
        setPurchaseRows(expensesResult.data || [])
        if ((expensesResult.data || []).length >= 1000) {
          setError('Demasiados registros de compras. No confirmes inventario sin revisar la importación.')
        }
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [monthStart, monthEnd, revision])

  const changeField = (type, field, value) => setRecords(previous => ({
    ...previous, [type]: { ...previous[type], [field]: value }
  }))

  const save = async type => {
    const entry = records[type]
    const regular = value => value === '' || VALUATION_RE.test(value)
    if (!regular(entry.opening_value) || !regular(entry.closing_value) ||
        !ADJUSTMENT_RE.test(entry.external_adjustment) ||
        entry.notes.length > 2000) {
      setError('Revisa los importes: máximo dos decimales. Deja los importes desconocidos en blanco.')
      return
    }
    if (entry.purchases_reconciled) {
      const rows = purchases[type]
      const kinds = new Set(rows.map(item => item.period_kind))
      const mismatched = rows.some(item => item.tax_basis !== entry.valuation_basis)
      if (kinds.size > 1 || mismatched) {
        setError('No se pueden confirmar compras con posibles duplicidades o bases fiscales diferentes.')
        return
      }
    }
    setSaving(true)
    setMessage('')
    setError('')
    const { error: saveError } = await supabase.rpc('analytics_save_monthly_inventory', {
      p_month_start: monthStart,
      p_stock_type: type,
      p_opening_value: entry.opening_value === '' ? null : Number(entry.opening_value),
      p_closing_value: entry.closing_value === '' ? null : Number(entry.closing_value),
      p_external_adjustment: Number(entry.external_adjustment),
      p_valuation_basis: entry.valuation_basis,
      p_purchases_reconciled: entry.purchases_reconciled,
      p_notes: entry.notes.trim() || null
    })
    setSaving(false)
    if (saveError) {
      setError('No se pudo guardar el inventario: ' + saveError.message)
      return
    }
    setMessage('Inventario de ' + (type === 'food' ? 'alimentos' : 'bebidas') +
      ' guardado en Supabase. Los cambios quedan auditados.')
    setRevision(value => value + 1)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="dashboard-panel">
        <h3>Inventario mensual · Valoración</h3>
        <p>Valor total de existencias de alimentos y bebidas, sin gestionar productos individuales.</p>
        <label>Mes
          <input type="month" value={month} disabled={saving}
            onChange={event => setMonth(event.target.value)} />
        </label>
        <p>El consumo estimado no es automáticamente el coste contable ni el beneficio. Se muestra solamente si existen datos coherentes y compras verificadas.</p>
        {error && <p role="alert" className="manager-error">{error}</p>}
        {message && <p role="status">{message}</p>}
      </div>
      {TYPES.map(type => (
        <InventoryCard key={type.key} type={type}
          entry={records[type.key]} purchases={purchases[type.key]}
          loading={loading || Boolean(error)} saving={saving}
          onChange={changeField} onSave={save} />
      ))}
    </div>
  )
}
