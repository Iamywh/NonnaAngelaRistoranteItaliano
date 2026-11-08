import { supabase } from './supabaseClient.js'

const FUNCTION_NAME = 'manager-manual-docs'

async function requestManualDocument(query = '', options = {}) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) {
    throw new Error('Inicia sesión en Analytics para acceder a los PDF privados.')
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}${query}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
    }
  })

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.clone().json()
      detail = payload?.error || ''
    } catch {
      detail = await response.text()
    }

    throw new Error(detail || `Error ${response.status}`)
  }

  return response
}

export async function getManualPdfStatus() {
  const response = await requestManualDocument('?status=1')
  return response.json()
}

export async function uploadManualPdf(documentId, file) {
  if (!file || file.type !== 'application/pdf') {
    throw new Error('Selecciona un archivo PDF válido.')
  }

  const response = await requestManualDocument(`?document=${encodeURIComponent(documentId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf' },
    body: file
  })

  return response.json()
}

export async function downloadManualPdf(documentId, filename) {
  const response = await requestManualDocument(`?document=${encodeURIComponent(documentId)}&download=1`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
