import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'manager-manual'
const DOCUMENTS: Record<string, string> = {
  apertura: 'checklist-apertura-sala.pdf',
  servicio: 'checklist-durante-servicio.pdf',
  cierre: 'checklist-cierre-sala.pdf',
  'control-mesas': 'control-mesas-almuerzo-cena.pdf'
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-manager-password',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function isAuthorized(request: Request) {
  const expected = String(Deno.env.get('MANAGER_PASSWORD') || '').trim()
  const provided = String(request.headers.get('x-manager-password') || '').trim()
  return Boolean(expected && provided && expected === provided)
}

function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!isAuthorized(request)) {
    return jsonResponse({ error: 'Acceso Manager no autorizado.' }, 401)
  }

  try {
    const url = new URL(request.url)
    const admin = getAdminClient()

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

    if (!filename) {
      return jsonResponse({ error: 'Documento no reconocido.' }, 400)
    }

    if (request.method === 'POST') {
      const contentType = request.headers.get('content-type') || ''
      if (!contentType.toLowerCase().includes('application/pdf')) {
        return jsonResponse({ error: 'El archivo debe ser un PDF.' }, 415)
      }

      const fileBytes = await request.arrayBuffer()
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
    console.error(error)
    return jsonResponse({ error: error?.message || 'Error interno.' }, 500)
  }
})
