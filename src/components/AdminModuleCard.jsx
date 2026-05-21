import React from 'react'

export default function AdminModuleCard({ title, description, meta, onClick }) {
  return (
    <button className="admin-module" onClick={onClick}>
      <span>{title}</span>
      <strong>{description}</strong>
      {meta && <small>{meta}</small>}
    </button>
  )
}