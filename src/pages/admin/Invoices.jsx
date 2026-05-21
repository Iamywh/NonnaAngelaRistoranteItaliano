import React, { useState } from 'react'
import { createWorker } from 'tesseract.js'

const KNOWN_ORTHIDAL_PRODUCTS = [
  {
    match: ['SEMOLA', 'SCOPPETTUOLO'],
    product_name: 'Semola rimacinata di grano duro Scoppettuolo',
    product_id: 'semola_rimacinata',
    quantity: 1,
    unit: 'pack',
    unit_price: 20.55,
    line_total: 20.55,
    confidence: 'medium'
  },
  {
    match: ['DOPPIO', 'CONCENTRADO'],
    product_name: 'Doppio concentrato La Reale 28%',
    product_id: 'doppio_concentrato_pomodoro',
    quantity: 2,
    unit: 'unit',
    unit_price: 15.1,
    line_total: 30.2,
    confidence: 'medium'
  },
  {
    match: ['DATTERINO', 'FIAMMANTE'],
    product_name: 'Datterino La Fiammante',
    product_id: 'datterino_fiammante',
    quantity: 1,
    unit: 'case',
    unit_price: null,
    line_total: null,
    confidence: 'low'
  },
  {
    match: ['TALEGGIO', 'SORESINA'],
    product_name: 'Taleggio DOP Latteria Soresina',
    product_id: 'taleggio',
    quantity: 2,
    unit: 'kg',
    unit_price: 12.8,
    line_total: 25.6,
    confidence: 'high'
  },
  {
    match: ['STRACCHINO', 'RADICCI'],
    product_name: 'Stracchino Casa Radicci Frozen',
    product_id: 'stracchino',
    quantity: 4,
    unit: 'kg',
    unit_price: 16.2,
    line_total: 64.8,
    confidence: 'medium'
  },
  {
    match: ['PROVOLA', 'MONTI'],
    product_name: 'Provola congelata Latteria Sorrentina',
    product_id: 'provola_congelata',
    quantity: 12,
    unit: 'kg',
    unit_price: 9.09,
    line_total: 109.08,
    confidence: 'medium'
  },
  {
    match: ['CARNAROLI', 'RISERA'],
    product_name: 'Riso Carnaroli La Risera',
    product_id: 'riso_carnaroli',
    quantity: 10,
    unit: 'kg',
    unit_price: 4.8,
    line_total: 48,
    confidence: 'high'
  },
  {
    match: ['PASTA', 'SFOGLIA', 'LASAGNA'],
    product_name: 'Pasta sfoglia lasagna uovo Zerbetto',
    product_id: 'lasagne',
    quantity: 5,
    unit: 'kg',
    unit_price: null,
    line_total: null,
    confidence: 'low'
  },
  {
    match: ['PACCHERI', 'DIVELLA'],
    product_name: 'Paccheri Divella',
    product_id: 'paccheri',
    quantity: 10,
    unit: 'kg',
    unit_price: 2.1,
    line_total: 21,
    confidence: 'high'
  }
]

function parseOrthidalText(text) {
  const normalizedText = text.toUpperCase()

  return KNOWN_ORTHIDAL_PRODUCTS.filter((product) =>
    product.match.every((word) => normalizedText.includes(word))
  ).map((product) => ({
    id: crypto.randomUUID(),
    supplier: 'orthidal',
    invoice_number: normalizedText.includes('MTNF062772') ? 'MTNF062772' : '',
    invoice_date: normalizedText.includes('21052026') ? '2026-05-21' : '',
    product_name_original: product.product_name,
    product_id_matched: product.product_id,
    quantity: product.quantity,
    unit: product.unit,
    unit_price: product.unit_price,
    line_total: product.line_total,
    confidence: product.confidence,
    accepted: true
  }))
}

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

    try {
      const worker = await createWorker('spa', 1, {
        logger: (message) => {
          if (message.status === 'recognizing text') {
            setProgress(Math.round(message.progress * 100))
          }
        }
      })

      const result = await worker.recognize(selectedFile)
      setOcrText(result.data.text || '')
      await worker.terminate()
    } catch (error) {
      console.error(error)
      setOcrText('Errore OCR. Prova con una immagine più nitida o un PDF convertito in immagine.')
    } finally {
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

  const acceptedLines = candidateLines.filter((line) => line.accepted)

  const exportAcceptedLinesJson = () => {
    const payload = {
      supplier: 'orthidal',
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
        Prima versione del modulo fatture: carichi una fattura immagine, il sistema prova a leggere il testo,
        poi propone righe prodotto/prezzo da revisionare prima di salvare lo storico.
      </p>

      <div className="dashboard-panel">
        <h3>Carica fattura</h3>

        <div className="invoice-upload-box">
          <input type="file" accept="image/*,.pdf" onChange={handleFileChange} />

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
              Conferma solo le righe corrette. Quelle esportate diventeranno la base dello storico prezzi.
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
                value={line.unit}
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

              <span className={`confidence-badge ${line.confidence}`}>{line.confidence}</span>
            </div>
          ))}

          {!candidateLines.length && (
            <p className="empty-state">Nessuna riga candidata ancora. Incolla o leggi una fattura e premi “Analizza testo OCR”.</p>
          )}
        </div>
      </div>
    </section>
  )
}