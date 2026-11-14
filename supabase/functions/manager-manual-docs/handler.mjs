const BUCKET = 'manager-manual'
const DOCUMENTS = {
  apertura: 'checklist-apertura-sala.pdf',
  servicio: 'checklist-durante-servicio.pdf',
  cierre: 'checklist-cierre-sala.pdf',
  'control-mesas': 'control-mesas-almuerzo-cena.pdf'
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
  })
}

export function createManualHandler(getAdminClient) { return async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!['GET', 'POST'].includes(request.method)) return jsonResponse({ error: 'Método no permitido.' }, 405)

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) {
    return jsonResponse({ error: 'Inicia sesión en Analytics para acceder a los PDF privados.' }, 401)
  }

  try {
    const admin = getAdminClient()
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    if (authError || !auth.user) {
      return jsonResponse({ error: 'La sesión no es válida. Vuelve a iniciar sesión en Analytics.' }, 401)
    }

    const { data: role, error: roleError } = await admin
      .from('analytics_user_roles')
      .select('role,is_active')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (roleError) throw roleError
    if (!role?.is_active || !['owner', 'admin'].includes(role.role)) {
      return jsonResponse({ error: 'Tu cuenta no tiene acceso a los PDF privados.' }, 403)
    }

    const url = new URL(request.url)
    if (url.searchParams.get('status') === '1') {
      const { data, error } = await admin.storage.from(BUCKET).list('', { limit: 100 })
      if (error) throw error

      const existing = new Set((data || []).map((item) => item.name))
      const documents = Object.fromEntries(
        Object.entries(DOCUMENTS).map(([id, filename]) => [id, existing.has(filename)])
      )

      return jsonResponse({ documents })
    }

    const documentId = url.searchParams.get('document') || ''
    const filename = DOCUMENTS[documentId]

    if (!Object.hasOwn(DOCUMENTS, documentId)) {
      return jsonResponse({ error: 'Documento no reconocido.' }, 400)
    }

    if (request.method === 'POST') {
      const contentType = request.headers.get('content-type') || ''
      if (!contentType.toLowerCase().includes('application/pdf')) {
        return jsonResponse({ error: 'El archivo debe ser un PDF.' }, 415)
      }

      // Read a bounded stream instead of trusting Content-Length.
      const reader = request.body?.getReader()
      const chunks = []
      let size = 0
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 10 * 1024 * 1024) {
            await reader.cancel()
            return jsonResponse({ error: 'El PDF supera 10 MB.' }, 413)
          }
          chunks.push(value)
        }
      }
      const fileBytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { fileBytes.set(chunk, offset); offset += chunk.length }
      if (size && new TextDecoder().decode(fileBytes.slice(0, 5)) !== '%PDF-') {
        return jsonResponse({ error: 'El archivo no es un PDF válido.' }, 415)
      }
      if (!fileBytes.byteLength) {
        return jsonResponse({ error: 'El PDF está vacío.' }, 400)
      }

      const { error } = await admin.storage.from(BUCKET).upload(filename, fileBytes, {
        contentType: 'application/pdf',
        upsert: true
      })

      if (error) throw error
      return jsonResponse({ ok: true, document: documentId, filename })
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Método no permitido.' }, 405)
    }

    const { data, error } = await admin.storage.from(BUCKET).download(filename)
    if (error || !data) {
      return jsonResponse({ error: 'PDF oficial no disponible.' }, 404)
    }

    const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline'

    return new Response(data, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'private, no-store'
      }
    })
  } catch (error) {
    console.error('Manual document request failed')
    return jsonResponse({ error: 'No se pudo acceder a los PDF privados.' }, 500)
  }
} }
