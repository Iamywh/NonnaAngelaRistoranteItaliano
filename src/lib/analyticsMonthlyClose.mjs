// UI guardrails for the server-owned immutable monthly closure.
const requiredChecks=['sales','expenses','inventory','igic','scope']
export function closeStatus(report,closure) {
  if(!closure)return 'not-closed'
  if(!report || typeof report.fingerprint!=='string' || !report.ready)return 'unavailable'
  return report.fingerprint===closure.source_fingerprint?'consistent':'changed'
}
export function closeReadyForSubmission(report,closure,checks,note) {
  return Boolean(
    report?.ready===true && !closure && typeof report.fingerprint==='string' &&
    requiredChecks.every(key=>checks?.[key]===true) &&
    typeof note==='string' && note.trim().length>=10 && note.trim().length<=1500
  )
}
export function managerialNetResult(values) {
  // Client calculation is informational only; server must independently recalculate
  // source values before saving any close.
  const keys=['revenue_net','food_consumption_net','beverage_consumption_net','other_expenses_net']
  if(!values || keys.some(k=>typeof values[k]!=='number'||!Number.isFinite(values[k])||
    values[k]<0))return null
  return Math.round((values.revenue_net-values.food_consumption_net-
    values.beverage_consumption_net-values.other_expenses_net)*100)/100
}
