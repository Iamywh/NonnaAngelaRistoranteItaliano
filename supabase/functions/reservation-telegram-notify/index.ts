const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function cleanValue(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function buildManagerUrl(request: Request) {
  const explicitUrl = Deno.env.get('MANAGER_RESERVATIONS_URL')
  if (explicitUrl) return explicitUrl

  const origin = request.headers.get('origin') || Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('SITE_URL') || 'https://nonnaangelaristoranteitaliano.netlify.app'
  return new URL('/manager/reservas', origin).toString()
}

function buildTelegramMessage(reservation: Record<string, unknown>) {
  const notes = cleanValue(reservation.notes, '')
  const lines = [
    '🍝 Nueva reserva Nonna Angela',
    '',
    `👤 Cliente: ${cleanValue(reservation.customer_name, 'Sin nombre')}`,
    `📅 Fecha: ${cleanValue(reservation.reservation_date)}`,
    `🕒 Hora: ${cleanValue(reservation.reservation_time)}`,
    `👥 Personas: ${cleanValue(reservation.guests)}`,
    `📞 Teléfono: ${cleanValue(reservation.customer_phone)}`,
    `✉️ Email: ${cleanValue(reservation.customer_email, 'No indicado')}`,
    `📲 Canal elegido: ${cleanValue(reservation.confirmation_channel, 'whatsapp')}`,
    `📍 Zona: ${cleanValue(reservation.area_preference, 'indiferente')}`,
    '',
    'Estado: pendiente de confirmar'
  ]

  if (notes) {
    lines.push('', `📝 Notas: ${notes}`)
  }

  return lines.join('\n')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID')

    if (!telegramBotToken || !telegramChatId) {
      return new Response(JSON.stringify({ sent: false, reason: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await request.json().catch(() => ({}))
    const reservation = body?.reservation || {}
    const managerUrl = buildManagerUrl(request)

    const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: buildTelegramMessage(reservation),
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Abrir Manager Reservas', url: managerUrl }
            ]
          ]
        }
      })
    })

    const telegramPayload = await telegramResponse.json().catch(() => ({}))

    if (!telegramResponse.ok) {
      return new Response(JSON.stringify({ sent: false, telegramPayload }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ sent: true, managerUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error?.message || 'Unexpected error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
