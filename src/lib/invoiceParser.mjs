// Supported: explicitly labelled rows; Orthidal PDF text with preserved columns.
// Packaging numbers are never interpreted as quantities or converted to kg.
export function parseInvoiceNumber(value, decimal = null) {
  const text = String(value ?? '').trim().replace(/[€\s]/g, '')
  if (!text || !/^-?\d[\d.,]*$/.test(text)) return null
  if (decimal === ',') {
    if (!/^-?\d+(?:,\d+)?$/.test(text)) return null
    return Number(text.replace(',', '.'))
  }
  if (/^-?\d+$/.test(text)) return Number(text)
  if (/^-?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(text)) return Number(text.replaceAll('.', '').replace(',', '.'))
  if (/^-?\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text)) return Number(text.replaceAll(',', ''))
  if (/^-?\d+[.,]\d{1,2}$/.test(text)) return Number(text.replace(',', '.'))
  return null // e.g. 1,000 is ambiguous without a documented column format
}

export function invoiceLineIssues(line) {
  const issues = []
  if (!line.product_name_original?.trim()) issues.push('Falta el producto')
  if (!line.unit?.trim()) issues.push('Falta la unidad')
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) issues.push('Cantidad no válida')
  if (!Number.isFinite(line.unit_price) || line.unit_price < 0) issues.push('Precio no válido')
  if (!Number.isFinite(line.line_total) || line.line_total < 0) issues.push('Importe no válido')
  if (!issues.length && Math.abs(line.quantity * line.unit_price - line.line_total) > .02) issues.push('Cantidad × precio no coincide con el importe; revisa descuentos e impuestos')
  return issues
}

export function parseOrthidalText(text) {
  const source = String(text || '')
  const rows = source.split(/\r?\n/)
  const supplier = /\bORTHIDAL\b/i.test(source) ? 'orthidal' : null
  const invoice = source.match(/(?:Presupuesto|Factura)\s*#?\s*([A-Z]+\d+)/i)?.[1] || null
  const output = []
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index].trim()
    let line
    const labelled = row.match(/^(.*?)\s+(?:cantidad|quantità|quantita|quantity|qty)\s*[:=]?\s*(.*)$/i)
    if (labelled) {
      const qty = labelled[2].match(/^([\d.,]+)\s*([a-z]+)?/i)
      const price = row.match(/(?:precio(?:\s+unitario)?|prezzo(?:\s+unitario)?|unit\s+price)\s*[:=]?\s*€?\s*([\d.,]+)/i)
      const total = row.match(/(?:importe|totale?|total)\s*[:=]?\s*€?\s*([\d.,]+)/i)
      const unit = qty?.[2]?.toLowerCase()
      line = { product_name_original: labelled[1], quantity: parseInvoiceNumber(qty?.[1]),
        unit: ['kg','kgs','g','l','ml','ud','uds','unit','pack','case'].includes(unit) ? unit : null,
        unit_price: parseInvoiceNumber(price?.[1]), line_total: parseInvoiceNumber(total?.[1]), source_text: row, format: 'labelled' }
    } else if (supplier) {
      // Orthidal: [code] description qty packs x(n) units price IGIC% amount €
      const table = row.match(/^\[(\d+)\]\s+(.+?)\s{2,}(\d+,\d{3})\s+\d+\s*x\(\d+\)\s+\d+\s+(\d+,\d{3})\s+\d+(?:,\d+)?%\s+(\d+,\d{2})\s*€$/i)
      if (table) {
        const next = rows[index + 1] || ''
        const unit = next.match(/\b(Uds|Kgs)\s*$/i)?.[1]?.toLowerCase() || null
        line = { product_name_original: table[2], supplier_product_code: table[1],
          quantity: parseInvoiceNumber(table[3], ','), unit,
          unit_price: parseInvoiceNumber(table[4], ','), line_total: parseInvoiceNumber(table[5], ','),
          source_text: row + '\n' + next, format: 'orthidal-columns' }
      }
    }
    if (!line) continue
    const issues = invoiceLineIssues(line)
    output.push({ ...line, id: `line-${index}`, supplier, invoice_number: invoice, invoice_date: null,
      product_id_matched: null, issues, confidence: issues.length ? 'low' : 'medium', accepted: false })
  }
  return output
}
