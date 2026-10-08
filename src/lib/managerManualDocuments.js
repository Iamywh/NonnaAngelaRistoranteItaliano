const FUNCTION_NAME = 'manager-manual-docs'

function getConfig() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const managerPassword = import.meta.env.VITE_MANAGER_PASSWORD

  if (!supabaseUrl || !anonKey || !managerPassword) {
    throw new Error('La configuración del Manual Operativo no está completa.')
  }

  return { supabaseUrl, anonKey, managerPassword }
}

async function requestManualDocument(query = '', options = {}) {
  const { supabaseUrl, anonKey, managerPassword } = getConfig()
  const response = await fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}${query}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'x-manager-password': managerPassword,
      ...(options.headers || {})
    }
  })

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
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
