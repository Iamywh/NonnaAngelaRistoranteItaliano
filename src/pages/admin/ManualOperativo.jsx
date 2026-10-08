import React, { useEffect, useMemo, useState } from 'react'
import { controlMesaGroups, manualDocuments } from '../../data/manualOperativo.js'
import { downloadManualPdf, getManualPdfStatus, uploadManualPdf } from '../../lib/managerManualDocuments.js'
import '../../styles/manual-operativo.css'

function ChecklistDocument({ document }) {
  return (
    <div className="manual-document-view">
      <div className="manual-document-heading">
        <p className="eyebrow">Nonna Angela · Procedimiento interno</p>
        <h3>{document.subtitle}</h3>
      </div>

      <div className="manual-meta-row">
        {document.metaFields?.map((field) => (
          <span key={field}><strong>{field}:</strong> ____________________</span>
        ))}
      </div>

      <div className="manual-checklist-sections">
        {document.sections.map((section) => (
          <section className="manual-checklist-section" key={section.number}>
            <div className="manual-section-title">
              <span>{section.number}</span>
              <h4>{section.title}</h4>
            </div>
            <div className="manual-checklist-items">
              {section.items.map((item, index) => (
                <label key={`${section.number}-${index}`} className="manual-check-item">
                  <input type="checkbox" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      {document.principle && <p className="manual-principle">{document.principle}</p>}

      {document.footerFields?.length > 0 && (
        <div className="manual-footer-fields">
          {document.footerFields.map((field) => (
            <p key={field}><strong>{field}:</strong> ________________________________________________</p>
          ))}
        </div>
      )}

      <p className="manual-temporary-note">
        Las casillas de esta vista son temporales y no guardan datos.
      </p>
    </div>
  )
}

function ControlTable({ service, print = false }) {
  const rows = Array.from({ length: 20 }, (_, index) => index + 1)

  return (
    <section className={print ? 'control-mesas-sheet is-print' : 'control-mesas-sheet'}>
      <div className="control-mesas-header">
        <div>
          <strong>NONNA ANGELA | CONTROL DE MESAS</strong>
          <span>{service}</span>
        </div>
        <div className="control-mesas-meta">
          <span>Fecha: ______________________</span>
          <span>Responsable: ___________________________</span>
          <span>20 mesas / servicios por turno</span>
        </div>
      </div>

      <div className="control-mesas-table-wrap">
        <table className="control-mesas-table">
          <thead>
            <tr>
              <th rowSpan="2">MESA</th>
              <th rowSpan="2">NOMBRE RESERVA</th>
              <th rowSpan="2">PAX</th>
              {controlMesaGroups.map((group) => (
                <th key={group.label} colSpan={group.fields.length}>{group.label}</th>
              ))}
            </tr>
            <tr>
              {controlMesaGroups.flatMap((group) =>
                group.fields.map((field) => <th key={`${group.label}-${field}`}>{field}</th>)
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <td>{row}</td>
                <td className="write-cell"></td>
                <td className="write-cell small"></td>
                {controlMesaGroups.flatMap((group) =>
                  group.fields.map((field) => (
                    <td key={`${row}-${group.label}-${field}`}>
                      <input type="checkbox" aria-label={`Mesa ${row} · ${group.label} · ${field}`} />
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="control-mesas-note">
        Marcar cada fase al completarla. Actualizar el POS y comunicar el estado de las mesas durante el servicio.
      </p>
    </section>
  )
}

function ControlMesasDocument({ onPrint }) {
  return (
    <div className="manual-document-view">
      <div className="manual-document-heading">
        <p className="eyebrow">Nonna Angela · Procedimiento interno</p>
        <h3>Control de Mesas — Almuerzo y Cena</h3>
        <p>Vista operativa temporal. Las casillas no guardan información.</p>
      </div>

      <div className="manual-inline-actions">
        <button className="primary-button" type="button" onClick={onPrint}>
          Abrir versión para imprimir
        </button>
      </div>

      <ControlTable service="ALMUERZO / PRANZO" />
      <ControlTable service="CENA / CENA" />
    </div>
  )
}

function PrintControlMesas({ onBack }) {
  const handlePrint = () => window.print()

  return (
    <div className="manual-print-view">
      <div className="manual-print-toolbar">
        <button className="ghost-button" type="button" onClick={onBack}>← Volver</button>
        <button className="primary-button" type="button" onClick={handlePrint}>Imprimir</button>
      </div>
      <ControlTable service="ALMUERZO / PRANZO" print />
      <ControlTable service="CENA / CENA" print />
    </div>
  )
}

export default function ManualOperativo({ setCurrentPage }) {
  const [selectedId, setSelectedId] = useState(null)
  const [printMode, setPrintMode] = useState(false)
  const [pdfStatus, setPdfStatus] = useState({})
  const [statusError, setStatusError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  const selectedDocument = useMemo(
    () => manualDocuments.find((document) => document.id === selectedId) || null,
    [selectedId]
  )

  const refreshPdfStatus = async () => {
    setStatusError('')
    try {
      const result = await getManualPdfStatus()
      setPdfStatus(result?.documents || {})
    } catch (error) {
      setStatusError(error?.message || 'No se pudo comprobar el estado de los PDF.')
    }
  }

  useEffect(() => {
    refreshPdfStatus()
  }, [])

  const handleDownload = async (document) => {
    setBusyId(document.id)
    setMessage('')
    try {
      await downloadManualPdf(document.id, document.pdfFilename)
    } catch (error) {
      setMessage(`No se pudo descargar el PDF: ${error?.message || 'error desconocido'}`)
    } finally {
      setBusyId('')
    }
  }

  const handleUpload = async (document, file) => {
    if (!file) return
    setBusyId(document.id)
    setMessage('')
    try {
      await uploadManualPdf(document.id, file)
      setMessage(`PDF oficial cargado: ${document.title}.`)
      await refreshPdfStatus()
    } catch (error) {
      setMessage(`No se pudo cargar el PDF: ${error?.message || 'error desconocido'}`)
    } finally {
      setBusyId('')
    }
  }

  if (printMode) {
    return <PrintControlMesas onBack={() => setPrintMode(false)} />
  }

  return (
    <section className="admin-page manual-operativo-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')} type="button">
        ← Volver a la dashboard
      </button>

      <div className="admin-header manual-operativo-header">
        <div>
          <p className="eyebrow">Operaciones de sala</p>
          <h2>Manual Operativo</h2>
          <p>
            Procedimientos oficiales de Nonna Angela para apertura, servicio, cierre y control de mesas.
          </p>
        </div>
      </div>

      {statusError && (
        <div className="manual-setup-alert">
          <strong>PDF privados pendientes de conexión.</strong>
          <span>{statusError}</span>
        </div>
      )}

      {message && <div className="manual-message">{message}</div>}

      <div className="manual-card-grid">
        {manualDocuments.map((document) => {
          const isAvailable = pdfStatus[document.id] === true
          return (
            <article className="manual-card" key={document.id}>
              <div className="manual-card-icon" aria-hidden="true">{document.icon}</div>
              <div className="manual-card-copy">
                <p className="manual-card-kicker">{document.type === 'table' ? 'Plantilla operativa' : 'Procedimiento oficial'}</p>
                <h3>{document.title}</h3>
                <p>{document.description}</p>
              </div>

              <div className="manual-pdf-state">
                <span className={isAvailable ? 'available' : 'pending'}>
                  {isAvailable ? 'PDF oficial disponible' : 'PDF oficial pendiente'}
                </span>
              </div>

              <div className="manual-card-actions">
                <button className="primary-button" type="button" onClick={() => setSelectedId(document.id)}>
                  Ver documento
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!isAvailable || busyId === document.id}
                  onClick={() => handleDownload(document)}
                >
                  {busyId === document.id ? 'Procesando…' : 'Descargar PDF'}
                </button>
              </div>

              {!isAvailable && (
                <label className="manual-upload-control">
                  <span>Cargar PDF oficial</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      handleUpload(document, file)
                      event.target.value = ''
                    }}
                  />
                </label>
              )}

              {document.type === 'table' && (
                <button className="manual-print-link" type="button" onClick={() => setPrintMode(true)}>
                  Abrir versión para imprimir
                </button>
              )}
            </article>
          )
        })}
      </div>

      {selectedDocument && (
        <div className="manual-viewer-shell">
          <div className="manual-viewer-toolbar">
            <div>
              <p className="eyebrow">Visualización online</p>
              <h3>{selectedDocument.title}</h3>
            </div>
            <div className="manual-viewer-actions">
              <button
                className="ghost-button"
                type="button"
                disabled={pdfStatus[selectedDocument.id] !== true || busyId === selectedDocument.id}
                onClick={() => handleDownload(selectedDocument)}
              >
                Descargar PDF
              </button>
              <button className="ghost-button" type="button" onClick={() => setSelectedId(null)}>
                Cerrar
              </button>
            </div>
          </div>

          {selectedDocument.type === 'table'
            ? <ControlMesasDocument onPrint={() => setPrintMode(true)} />
            : <ChecklistDocument document={selectedDocument} />}
        </div>
      )}
    </section>
  )
}
