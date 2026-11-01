import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { monthlyOverview } from '../../lib/analyticsMetrics.mjs'
import { goalProgress } from '../../lib/analyticsPlanning.mjs'

const money = amount => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR'
}).format(amount)
const integer = amount => new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 0
}).format(amount)
const canaryMonth = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit'
}).format(new Date())
const categoryLabels = {
  food_purchases: 'Compras alimentos', beverage_purchases: 'Compras bebidas',
  payroll: 'Personal', rent: 'Alquiler', utilities: 'Suministros',
  marketing: 'Marketing', cleaning_supplies: 'Limpieza y consumibles',
  packaging: 'Embalajes', maintenance: 'Mantenimiento',
  professional_services: 'Servicios profesionales', bank_fees: 'Comisiones',
  other: 'Otros'
}
const nextMonth = month => {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10)
}
const cardStyle = {
  padding: '16px', border: '1px solid rgba(128,128,128,.3)',
  borderRadius: 12, display: 'grid', gap: 6, minWidth: 0
}
const boxStyle = { display: 'grid', gap: 14 }

function Kpi({ label, value, detail }) {
  return <div style={cardStyle}>
    <span style={{ opacity: .7, fontSize: 14 }}>{label}</span>
    <strong style={{ fontSize: 'clamp(21px, 2.5vw, 28px)', overflowWrap: 'anywhere' }}>{value}</strong>
    {detail && <small style={{ opacity: .75 }}>{detail}</small>}
  </div>
}
function Warnings({ metric }) {
  const notes = []
  if (!metric.complete)
    notes.push('Mes incompleto: ' + metric.recordedDays + ' de ' +
      metric.daysInMonth + ' días registrados y ' + metric.finalizedDays +
      ' finalizados. No se infiere ningún importe para los días sin registro.')
  if (metric.missingOpenServices)
    notes.push('Algún servicio abierto no tiene su registro de ventas. Revisa Registro diario.')
  if (metric.revenueMixed)
    notes.push('Las ventas incluyen importes brutos y netos: no se suman como si fueran comparables.')
  if (metric.expenseMixed)
    notes.push('Gastos contiene importes brutos y netos. No se presentan como un total contable único.')
  if (metric.overlappingExpenseCategories.length)
    notes.push('Posible doble cómputo entre gastos diarios y mensuales: ' +
      metric.overlappingExpenseCategories.map(c => categoryLabels[c] || c).join(', ') + '.')
  return notes.length ? <div className="dashboard-panel">
    <h3>Calidad y cobertura de datos</h3>
    <ul>{notes.map(note => <li key={note}>{note}</li>)}</ul>
  </div> : <p role="status">Los días están finalizados y no hay alertas de combinación fiscal en estos registros.</p>
}

export default function FinancialDashboard() {
  const [month, setMonth] = useState(canaryMonth)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const start = validMonth ? month + '-01' : null
  const end = validMonth ? nextMonth(month) : null

  useEffect(() => {
    let alive = true
    if (!start) {
      setError('Selecciona un mes válido.')
      setData(null)
      setLoading(false)
      return () => { alive = false }
    }
    const load = async () => {
      setLoading(true)
      setError('')
      setData(null)
      const [sales, expenses, inventories, historical, targets] = await Promise.all([
        supabase.from('analytics_daily_entries')
          .select('business_date,status,lunch_status,dinner_status,analytics_service_entries(service_type,covers,food_revenue_amount,beverage_revenue_amount,tax_basis)')
          .gte('business_date', start).lt('business_date', end)
          .order('business_date', { ascending: true }).limit(35),
        supabase.from('analytics_expenses')
          .select('period_kind,period_date,category,amount,tax_basis')
          .gte('period_date', start).lt('period_date', end).limit(1000),
        supabase.from('analytics_monthly_inventory')
          .select('stock_type,month_start,opening_value,closing_value,external_adjustment,valuation_basis,purchases_reconciled,reconciled_purchase_total,reconciled_purchase_count')
          .eq('month_start', start).limit(3),
        supabase.from('analytics_monthly_history')
          .select('month_start,revenue_total,covers,tax_basis,data_quality,source_note,notes')
          .eq('month_start', start).maybeSingle(),
        supabase.from('analytics_monthly_targets')
          .select('month_start,revenue_target,covers_target,ticket_target,expense_ceiling,food_cost_ceiling_pct,beverage_cost_ceiling_pct,revenue_basis,expense_basis,notes')
          .eq('month_start', start).maybeSingle()
      ])
      if (!alive) return
      const failed = [sales, expenses, inventories, historical, targets].find(result => result.error)
      if (failed) {
        setError('Error leyendo Analytics: ' + failed.error.message)
        setLoading(false)
        return
      }
      if ((expenses.data || []).length >= 1000) {
        setError('Hay demasiados gastos para verificar el mes de forma segura. Solicita paginación.')
        setLoading(false)
        return
      }
      setData({
        dayEntries: sales.data || [], expenses: expenses.data || [],
        inventories: inventories.data || [],
        historical: historical.data || null,
        targets: targets.data || null
      })
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [start, end, reload])

  const metric = useMemo(() =>
    data ? monthlyOverview({ month, ...data }) : null, [month, data])
  const plan = metric && data ? goalProgress(metric, data.historical, data.targets) : null
  const maxDaily = metric ? Math.max(1, ...metric.daily.map(day => day.total)) : 1
  const topExpense = metric ? Math.max(1, ...metric.expenseByCategory.map(row => row.amount)) : 1

  return <div style={boxStyle}>
    <div className="dashboard-panel">
      <h3>Dashboard financiera</h3>
      <p>Indicadores de gestión basados únicamente en registros existentes. Los meses incompletos no representan el total real del restaurante.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }}>
        <label>Mes <input type="month" value={month}
          onChange={event => { setLoading(true); setMonth(event.target.value) }} /></label>
        <button type="button" className="ghost-button" disabled={loading}
          onClick={() => setReload(number => number + 1)}>Actualizar datos</button>
      </div>
      {error && <p role="alert" className="manager-error">{error}</p>}
      {loading && <p role="status">Cargando indicadores…</p>}
    </div>
    {!loading && metric && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <Kpi label="Días con registro" value={metric.recordedDays + ' / ' + metric.daysInMonth}
          detail={metric.finalizedDays + ' finalizados'} />
        <Kpi label="Ingresos registrados" value={metric.validRevenue ? money(metric.revenue) : 'No comparable'}
          detail={metric.validRevenue ? (metric.revenueBasis === 'net' ? 'Importes netos' : metric.revenueBasis === 'gross' ? 'Importes brutos' : 'Sin ventas monetarias') : 'Faltan registros o hay bases fiscales mezcladas'} />
        <Kpi label="Comensales registrados" value={integer(metric.covers)}
          detail="Solo servicios introducidos, sin estimación" />
        <Kpi label="Ticket medio registrado"
          value={metric.ticketAverage === null ? '—' : money(metric.ticketAverage)}
          detail="Ingresos registrados / comensales registrados" />
        <Kpi label="Gastos registrados"
          value={metric.expenseTotal === null ? 'No comparable' : money(metric.expenseTotal)}
          detail="No equivale al coste de consumo de inventario" />
      </div>
      <div className="dashboard-panel">
        <h3>Histórico mensual consolidado</h3>
        {data.historical ? <>
          <p><strong>{money(data.historical.revenue_total)}</strong> ·
            {data.historical.data_quality === 'verified' ? ' Verificado' : ' Estimación'}
            · {data.historical.tax_basis === 'gross' ? ' Bruto' : ' Neto'}
            {data.historical.covers == null ? '' : ' · ' + integer(data.historical.covers) + ' comensales'}
          </p>
          <p>Fuente: {data.historical.source_note}</p>
          <p>Este total es independiente del Registro diario. <strong>No se suman</strong> ambas fuentes.</p>
          {metric.recordedDays > 0 && <p role="status">
            También hay {metric.recordedDays} jornadas diarias: comprueba diferencias con
            el total histórico antes de cerrar el mes. La comparación de objetivos
            usa el histórico verificado si el mes diario sigue incompleto.
          </p>}
          {data.historical.data_quality === 'estimated' &&
            <p role="status">Importe orientativo. No se utiliza como resultado verificado de objetivos.</p>}
        </> : <p>No hay histórico consolidado para este mes. Puedes importarlo desde Histórico.</p>}
      </div>
      <div className="dashboard-panel">
        <h3>Objetivos y avance del mes</h3>
        {!data.targets ? <p>No hay objetivos definidos. Añádelos en la pestaña Objetivos.</p> : <>
          <p>Base de ingresos: {data.targets.revenue_basis === 'gross' ? 'bruta' : 'neta'}.
            Base de gastos: {data.targets.expense_basis === 'gross' ? 'bruta' : 'neta'}.</p>
          <p>Fuente para los objetivos:
            <strong>{plan.actual.origin === 'history' ? ' Histórico mensual verificado' :
              plan.actual.origin === 'daily' ? ' Registro diario finalizado completo' :
              ' Sin cierre mensual verificado'}</strong>.
          </p>
          {plan.comparisons.length === 0 ? <p>No hay métricas objetivo definidas.</p> :
            <div style={{ display: 'grid', gap: 12 }}>
              {plan.comparisons.map(item => {
                const format = value => item.unit === 'currency' ? money(value) :
                  item.unit === 'percentage' ? value + '%' : integer(value)
                return <div key={item.id} style={cardStyle}>
                  <strong>{item.label}</strong>
                  <span>Objetivo: {format(item.goal)}</span>
                  <span>Resultado: {item.observed == null ? 'Pendiente / no comparable' : format(item.observed)}</span>
                  {item.progress != null && <span>
                    {item.progress}% respecto al objetivo
                    {item.partial ? ' · gastos registrados, todavía no cerrados' :
                      item.achieved ? ' · objetivo cumplido' : ' · por debajo del objetivo o límite no cumplido'}
                  </span>}
                  {item.observed == null && <small>Hace falta cierre mensual o una base fiscal compatible.</small>}
                </div>
              })}
            </div>}
          <p>Los gastos registrados no se consideran definitivos hasta contar con un cierre de gastos.
            No se afirma que un presupuesto esté cumplido solo por no haber superado aún el límite.</p>
        </>}
      </div>
      <Warnings metric={metric} />
      <div className="dashboard-panel">
        <h3>Ventas por servicio</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Kpi label="Comida registrada" value={metric.foodRevenue === null ? '—' : money(metric.foodRevenue)}
            detail="Sin mezclar bruto y neto" />
          <Kpi label="Bebidas registradas" value={metric.beverageRevenue === null ? '—' : money(metric.beverageRevenue)}
            detail="Sin mezclar bruto y neto" />
        </div>
        <p>Desglose fiscal informado — Bruto: {money(metric.revenueByBasis.gross.total)} · Neto: {money(metric.revenueByBasis.net.total)}. No sumar ambos importes sin conciliación fiscal.</p>
      </div>
      <div className="dashboard-panel">
        <h3>Evolución diaria de ingresos registrados</h3>
        {!metric.daily.length ? <p>No hay jornadas registradas en este mes.</p> :
          metric.revenueMixed || metric.missingOpenServices
            ? <p>No se traza un gráfico agregado: existen bases fiscales distintas o registros de servicio incompletos.</p>
            : <div style={{ display: 'grid', gap: 12 }}>
                {metric.daily.map(day => (
                  <div key={day.date} style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>{day.date.slice(8)} · {day.finalized ? 'Finalizado' : 'Borrador'}</span>
                      <strong>{money(day.total)} · {integer(day.covers)} pax</strong>
                    </div>
                    <div style={{ background: 'rgba(128,128,128,.13)', height: 12, borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{
                        background: 'currentColor', opacity: day.finalized ? .75 : .35,
                        width: (day.total / maxDaily * 100) + '%', height: '100%'
                      }} />
                    </div>
                  </div>
                ))}
              </div>}
      </div>
      <div className="dashboard-panel">
        <h3>Distribución de gastos registrados</h3>
        {!metric.expenseByCategory.length ? <p>No hay gastos introducidos para este mes.</p> :
          <div style={{ display: 'grid', gap: 12 }}>
            {metric.expenseByCategory.map(row => (
              <div key={row.category + '-' + row.taxBasis} style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <span>{categoryLabels[row.category] || row.category} · {row.taxBasis === 'net' ? 'Neto' : 'Bruto'}</span>
                  <strong>{money(row.amount)}</strong>
                </div>
                <div style={{ background: 'rgba(128,128,128,.13)', height: 11, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: row.amount / topExpense * 100 + '%', height: '100%', background: 'currentColor', opacity: .6 }} />
                </div>
              </div>
            ))}
          </div>}
        <p>Bruto registrado: {money(metric.expenseByBasis.gross)} · Neto registrado: {money(metric.expenseByBasis.net)}. Los gastos de compras no equivalen al consumo mensual.</p>
      </div>
      <div className="dashboard-panel">
        <h3>Consumo estimado de inventario</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {['food', 'beverage'].map(type => {
            const item = metric.consumption[type]
            return <Kpi key={type}
              label={type === 'food' ? 'Consumo alimentos' : 'Consumo bebidas'}
              value={item.valid ? money(item.value) : 'Pendiente'}
              detail={item.valid ? (item.rate === null ? 'Porcentaje de coste no disponible' : 'Coste / ventas: ' + item.rate + '%') :
                'Requiere inventario inicial/final y compras reconciliadas'} />
          })}
        </div>
        <p>El porcentaje de coste solo se muestra con todos los días finalizados, ventas fiscalmente comparables e inventario reconciliado. La valoración no equivale automáticamente a la contabilidad oficial.</p>
      </div>
      <div className="dashboard-panel">
        <h3>Rentabilidad</h3>
        <p><strong>Beneficio: no disponible.</strong> Antes de calcularlo deben estar completos los ingresos, las existencias, los gastos y su tratamiento fiscal. No restamos las compras del consumo y tampoco mezclamos bases brutas y netas.</p>
      </div>
    </>}
  </div>
}
