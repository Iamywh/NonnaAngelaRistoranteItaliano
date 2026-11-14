import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
// Render the actual form with deterministic initial state and no external services.
test('closed-date form renders in every language instead of throwing ReferenceError', async () => {
  for (const date of ['2026-11-17', '2026-11-18', '2026-12-25', '2027-01-01']) {
    const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom', plugins: [{
      name: 'isolated-booking-render', enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/src/pages/Locale.jsx')) return code.replace("reservation_date: '',", `reservation_date: '${date}',`)
        if (id.endsWith('/src/lib/supabaseClient.js')) return 'export const publicSupabase = {}; export const supabase = {}'
      }
    }] })
    try {
      const { default: Locale } = await server.ssrLoadModule('/src/pages/Locale.jsx')
      const { LanguageProvider } = await server.ssrLoadModule('/src/i18n/LanguageContext.jsx')
      for (const language of ['es', 'en', 'it', 'fr']) {
        global.window = { localStorage: { getItem: () => language } }
        const html = renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(Locale)))
        assert.match(html, /form-message error/)
        assert.match(html, /name="reservation_time"[^>]*disabled/)
        assert.doesNotMatch(html, /locale\.closedSpecialDate/)
      }
    } finally { delete global.window; await server.close() }
  }
})
