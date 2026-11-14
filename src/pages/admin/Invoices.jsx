import React, { useState } from 'react'
import { createWorker } from 'tesseract.js'

import { parseOrthidalText, invoiceLineIssues } from '../../lib/invoiceParser.mjs'

export default function Invoices({ setCurrentPage }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [ocrText, setOcrText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [candidateLines, setCandidateLines] = useState([])

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    setSelectedFile(file || null)
    setOcrText('')
    setProgress(0)
    setCandidateLines([])
  }

  const runOcr = async () => {
    if (!selectedFile) return

    setIsProcessing(true)
    setOcrText('')
    setProgress(0)
    setCandidateLines([])

    let worker
    try {
      worker = await createWorker('spa', 1, {
        logger: (message) => {
          if (message.status === 'recognizing text') {
            setProgress(Math.round(message.progress * 100))
          }
        }
      })

      const result = await worker.recognize(selectedFile)
      setOcrText(result.data.text || '')

    } catch (error) {
      console.error(error)
      setOcrText('Errore OCR. Prova con una immagine più nitida o un PDF convertito in immagine.')
    } finally {
      if (worker) await worker.terminate()
      setIsProcessing(false)
    }
  }

  const analyzeOcrText = () => {
    const parsedLines = parseOrthidalText(ocrText)
    setCandidateLines(parsedLines)
  }

  const updateCandidateLine = (id, field, value) => {
    setCandidateLines((current) =>
      current.map((line) =>
        line.id === id
          ? {
              ...line,
              accepted: false,
              [field]:
                field === 'quantity' || field === 'unit_price' || field === 'line_total'
                  ? value === ''
                    ? null
                    : Number(value)
                  : value
            }
          : line
      )
    )
  }

  const toggleCandidateLine = (id) => {
    setCandidateLines((current) =>
      current.map((line) => (line.id === id ? { ...line, accepted: !line.accepted } : line))
    )
  }

  const acceptedLines = candidateLines.filter((line) => line.accepted && !invoiceLineIssues(line).length)

  const exportAcceptedLinesJson = () => {
    const payload = {
      supplier: acceptedLines[0]?.supplier || null,
      source: 'ocr_review',
      exported_at: new Date().toISOString(),
      lines: acceptedLines
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `invoice-lines-${payload.supplier}-${Date.now()}.json`
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Torna alla dashboard
      </button>

      <p className="eyebrow">Invoices</p>
      <h2>Fatture e OCR</h2>
      <p className="page-intro">
        Leggi il testo da un’immagine oppure incollalo da un PDF. Sono supportate righe con quantità, prezzo e totale espliciti e colonne Orthidal integre. I numeri vanno sempre verificati: l’esportazione JSON non aggiorna lo storico, i costi o l’inventario.
      </p>

      <div className="dashboard-panel">
        <h3>Carica fattura</h3>

        <div className="invoice-upload-box">
          <input type="file" accept="image/*" onChange={handleFileChange} />

          {selectedFile && (
            <p>
              File selezionato: <strong>{selectedFile.name}</strong>
            </p>
          )}

          <button
            className="primary-button"
            type="button"
            onClick={runOcr}
            disabled={!selectedFile || isProcessing}
          >
            {isProcessing ? `Lettura OCR... ${progress}%` : 'Leggi fattura con OCR'}
          </button>
        </div>
      </div>

      <div className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <h3>Testo estratto</h3>
            <p className="page-intro">
              Puoi correggere manualmente il testo prima di analizzarlo.
            </p>
          </div>

          <button className="primary-button" type="button" onClick={analyzeOcrText} disabled={!ocrText.trim()}>
            Analizza testo OCR
          </button>
        </div>

        <textarea
          className="ocr-textarea"
          value={ocrText}
          onChange={(event) => setOcrText(event.target.value)}
          placeholder="Qui apparirà il testo letto dalla fattura..."
        />
      </div>

      <div className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Revisione</p>
            <h3>Righe candidate</h3>
            <p className="page-intro">
              Conferma solo le righe corrette. Nessuna riga viene approvata automaticamente.
            </p>
          </div>

          <button
            className="primary-button"
            type="button"
            onClick={exportAcceptedLinesJson}
            disabled={!acceptedLines.length}
          >
            Esporta righe confermate
          </button>
        </div>

        <div className="invoice-lines-table">
          <div className="invoice-line-row table-head">
            <span>OK</span>
            <span>Prodotto</span>
            <span>Qty</span>
            <span>Unità</span>
            <span>€/Unità</span>
            <span>Totale</span>
            <span>Confidence</span>
          </div>

          {candidateLines.map((line) => (
            <div className="invoice-line-row" key={line.id}>
              <input
                type="checkbox"
                checked={line.accepted}
                disabled={invoiceLineIssues(line).length > 0}
                aria-label={`Conferma ${line.product_name_original}`}
                onChange={() => toggleCandidateLine(line.id)}
              />

              <input
                value={line.product_name_original}
                onChange={(event) =>
                  updateCandidateLine(line.id, 'product_name_original', event.target.value)
                }
              />

              <input
                type="number"
                step="0.01"
                value={line.quantity ?? ''}
                onChange={(event) => updateCandidateLine(line.id, 'quantity', event.target.value)}
              />

              <input
                value={line.unit ?? ''}
                onChange={(event) => updateCandidateLine(line.id, 'unit', event.target.value)}
              />

              <input
                type="number"
                step="0.01"
                value={line.unit_price ?? ''}
                onChange={(event) => updateCandidateLine(line.id, 'unit_price', event.target.value)}
              />

              <input
                type="number"
                step="0.01"
                value={line.line_total ?? ''}
                onChange={(event) => updateCandidateLine(line.id, 'line_total', event.target.value)}
              />

              <div><span className="confidence-badge">{invoiceLineIssues(line).length ? 'Da correggere' : 'Da verificare'}</span>
                <small>{invoiceLineIssues(line).join(' · ')}</small>
                <details><summary>Testo originale</summary><pre style={{whiteSpace:'pre-wrap'}}>{line.source_text}</pre></details></div>
            </div>
          ))}

          {!candidateLines.length && (
            <p className="empty-state">Nessuna riga riconosciuta. Il formato potrebbe non essere supportato: non verranno inventati valori. Incolla righe con quantità, unità, prezzo unitario e totale espliciti.</p>
          )}
        </div>
      </div>
    </section>
  )
}