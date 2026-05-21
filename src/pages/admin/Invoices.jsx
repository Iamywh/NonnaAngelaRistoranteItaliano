import React, { useState } from 'react'
import { createWorker } from 'tesseract.js'

export default function Invoices({ setCurrentPage }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [ocrText, setOcrText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    setSelectedFile(file || null)
    setOcrText('')
    setProgress(0)
  }

  const runOcr = async () => {
    if (!selectedFile) return

    setIsProcessing(true)
    setOcrText('')
    setProgress(0)

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

  return (
    <section className="admin-page">
      <button className="back-button" onClick={() => setCurrentPage('admin')}>
        ← Torna alla dashboard
      </button>

      <p className="eyebrow">Invoices</p>
      <h2>Fatture e OCR</h2>
      <p className="page-intro">
        Prima versione del modulo fatture: carichi una fattura immagine, il sistema prova a leggere il testo
        e lo mostriamo per la revisione. Il prossimo step sarà trasformare il testo in righe prodotto/prezzo.
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
        <h3>Testo estratto</h3>
        <textarea
          className="ocr-textarea"
          value={ocrText}
          onChange={(event) => setOcrText(event.target.value)}
          placeholder="Qui apparirà il testo letto dalla fattura..."
        />
      </div>
    </section>
  )
}