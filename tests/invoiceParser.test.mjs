import test from 'node:test'
import assert from 'node:assert/strict'
import {parseOrthidalText, parseInvoiceNumber, invoiceLineIssues} from '../src/lib/invoiceParser.mjs'
test('audit regression: extracts actual values, never historical product constants', () => {
 const [row] = parseOrthidalText('PACCHERI DIVELLA quantità 3 kg prezzo unitario 99,00 totale 297,00')
 assert.equal(row.quantity,3);assert.equal(row.unit_price,99);assert.equal(row.line_total,297)
 assert.equal(row.accepted,false);assert.equal(row.product_id_matched,null);assert.deepEqual(row.issues,[])
 assert.match(row.source_text,/99,00/)
})
test('numbers and ambiguous/missing/inconsistent data remain explicit', () => {
 assert.equal(parseInvoiceNumber('1.234,56'),1234.56)
 assert.equal(parseInvoiceNumber('1,234.56'),1234.56)
 assert.equal(parseInvoiceNumber('1,000'),null)
 const [missing] = parseOrthidalText('PASTA quantity 3 kg')
 assert.equal(missing.unit_price,null); assert.ok(missing.issues.length)
 const [bad] = parseOrthidalText('PASTA quantity 3 kg unit price 99 total 21')
 assert.ok(invoiceLineIssues(bad).length);assert.equal(bad.accepted,false)
 assert.deepEqual(parseOrthidalText('PACCHERI DIVELLA'),[])
})
test('Orthidal preserves invoice column units rather than interpreting package weight', () => {
 const [row] = parseOrthidalText('ORTHIDAL\nPresupuesto # MTNF123\n[6500505181] PACCHERI DIVELLA  12,000 1 x(12) 0 2,110 0% 25,32 €\n(500GR X 12UD)   Uds')
 assert.equal(row.quantity,12);assert.equal(row.unit,'uds');assert.equal(row.unit_price,2.11)
 assert.equal(row.line_total,25.32);assert.equal(row.invoice_number,'MTNF123');assert.equal(row.accepted,false)
})
