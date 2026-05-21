import React from 'react'

export default function KpiCard({ label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`kpi-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </article>
  )
}