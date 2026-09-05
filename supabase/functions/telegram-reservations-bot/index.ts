import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'
const CANARY_TIME_ZONE = 'Atlantic/Canary'
const SESSION_STATE_AWAITING_DATE = 'awaiting_reservation_date'
const SESSION_TTL_MINUTES = 10
const MAX_TELEGRAM_MESSAGE_LENGTH = 3800

function cleanValue(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function getSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

function getTelegramBotToken() {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN')
  return token
}

async function sendTelegramMessage(chatId: number | string, text: string, options: Record<string, unknown> = {}) {
  const token = getTelegramBotToken()

  const response = await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...options
    })
  })

  if (!response.ok) {
    const payload = await response.text().catch(() => '')
    console.error('Telegram sendMessage error:', payload)
  }
}

async function sendLongTelegramMessage(chatId: number | string, text: string, options: Record<string, unknown> = {}) {
  if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
    await sendTelegramMessage(chatId, text, options)
    return
  }

  const lines = text.split('\n')
  let currentChunk = ''

  for (const line of lines) {
    if ((currentChunk + '\n' + line).length > MAX_TELEGRAM_MESSAGE_LENGTH) {
      await sendTelegramMessage(chatId, currentChunk.trim(), options)
      currentChunk = line
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${line}` : line
    }
  }

  if (currentChunk.trim()) {
    await sendTelegramMessage(chatId, currentChunk.trim(), options)
  }
}

function getTodayDateValue() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CANARY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function parseDateValueFromText(text: string) {
  const normalizedText = String(text || '').trim()

  const europeanMatch = normalizedText.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (europeanMatch) {
    const day = Number(europeanMatch[1])
    const month = Number(europeanMatch[2])
    const year = Number(europeanMatch[3])
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }

  const isoMatch = normalizedText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }

  return ''
}

function formatDateForTitle(dateValue: string) {
  if (!dateValue) return '-'
  const date = new Date(`${dateValue}T12:00:00Z`)

  return date.toLocaleDateString('es-ES', {
    timeZone: CANARY_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function getReservationStatus(reservation: Record<string, unknown>) {
  return String(reservation.reservation_status || reservation.status || 'pending')
}

function getServiceStatus(reservation: Record<string, unknown>) {
  const serviceStatus = String(reservation.service_status || '')
  if (serviceStatus) return serviceStatus

  const legacyStatus = String(reservation.status || '')
  if (['seated', 'completed', 'no_show'].includes(legacyStatus)) return legacyStatus

  return 'not_arrived'
}

function isActiveReservation(reservation: Record<string, unknown>) {
  return !['rejected', 'cancelled'].includes(getReservationStatus(reservation))
}

function getReservationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    rejected: 'Rechazada',
    cancelled: 'Cancelada'
  }

  return labels[status] || status || '-'
}

function getServiceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    not_arrived: 'Sin llegar',
    seated: 'Sentado',
    completed: 'Completado',
    no_show: 'No-show'
  }

  return labels[status] || status || '-'
}

function formatReservationLine(reservation: Record<string, unknown>, index: number) {
  const time = cleanValue(reservation.reservation_time)
  const guests = Number(reservation.guests || 0)
  const name = cleanValue(reservation.customer_name, 'Cliente sin nombre')
  const phone = cleanValue(reservation.customer_phone, 'Sin teléfono')
  const area = cleanValue(reservation.area_preference, 'indiferente')
  const reservationStatus = getReservationStatusLabel(getReservationStatus(reservation))
  const serviceStatus = getServiceStatusLabel(getServiceStatus(reservation))
  const notes = String(reservation.notes || '').trim()

  const base = [
    `${index + 1}. ${time} · ${guests || '-'} pax · ${name}`,
    `   📞 ${phone}`,
    `   📍 ${area} · Reserva: ${reservationStatus} · Servicio: ${serviceStatus}`
  ]

  if (notes) {
    base.push(`   📝 ${notes.replace(/\s+/g, ' ').slice(0, 240)}`)
  }

  return base.join('\n')
}

async function getReservationsReport(dateValue: string) {
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_phone, customer_email, reservation_date, reservation_time, guests, area_preference, notes, status, reservation_status, service_status, source, created_at')
    .eq('reservation_date', dateValue)
    .order('reservation_time', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  const allReservations = data || []
  const activeReservations = allReservations.filter(isActiveReservation)
  const totalTables = activeReservations.length
  const totalGuests = activeReservations.reduce((total, reservation) => total + Number(reservation.guests || 0), 0)
  const pending = activeReservations.filter((reservation) => getReservationStatus(reservation) === 'pending').length
  const confirmed = activeReservations.filter((reservation) => getReservationStatus(reservation) === 'confirmed').length

  const title = `📅 Reservas Nonna Angela — ${formatDateForTitle(dateValue)}`
  const summary = [
    title,
    '',
    `🪑 Mesas reservadas: ${totalTables}`,
    `👥 Personas: ${totalGuests}`,
    `⏳ Pendientes: ${pending}`,
    `✅ Confirmadas: ${confirmed}`
  ]

  if (!activeReservations.length) {
    summary.push('', 'No hay reservas activas para esta fecha.')
    return summary.join('\n')
  }

  summary.push('', 'Orden cronológico:', '')
  summary.push(...activeReservations.map(formatReservationLine))

  const cancelledReservations = allReservations.filter((reservation) => !isActiveReservation(reservation))
  if (cancelledReservations.length) {
    summary.push('', `Anuladas/rechazadas: ${cancelledReservations.length}`)
  }

  return summary.join('\n')
}

async function saveAwaitingDateSession(chatId: number | string, userId: number | string) {
  const supabase = getSupabaseAdminClient()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('telegram_bot_sessions')
    .upsert({
      chat_id: String(chatId),
      user_id: String(userId),
      state: SESSION_STATE_AWAITING_DATE,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'chat_id,user_id'
    })

  if (error) throw error
}

async function getAwaitingDateSession(chatId: number | string, userId: number | string) {
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('telegram_bot_sessions')
    .select('state, expires_at')
    .eq('chat_id', String(chatId))
    .eq('user_id', String(userId))
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const isExpired = new Date(String(data.expires_at)).getTime() < Date.now()
  if (isExpired) {
    await clearSession(chatId, userId)
    return null
  }

  return data
}

async function clearSession(chatId: number | string, userId: number | string) {
  const supabase = getSupabaseAdminClient()

  await supabase
    .from('telegram_bot_sessions')
    .delete()
    .eq('chat_id', String(chatId))
    .eq('user_id', String(userId))
}

function getCommand(text: string) {
  const firstWord = String(text || '').trim().split(/\s+/)[0] || ''
  return firstWord.split('@')[0].toLowerCase()
}

function getTextAfterCommand(text: string) {
  return String(text || '').trim().replace(/^\/[^\s]+\s*/i, '').trim()
}

function isAllowedChat(chatId: number | string) {
  const allowedChatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!allowedChatId) return true
  return String(chatId) === String(allowedChatId)
}

function getForceDateReplyMarkup() {
  return {
    force_reply: true,
    selective: true,
    input_field_placeholder: '05-09-2026'
  }
}

async function handleMessage(message: Record<string, unknown>) {
  const chat = message.chat as Record<string, unknown> | undefined
  const from = message.from as Record<string, unknown> | undefined
  const chatId = chat?.id as number | string | undefined
  const userId = (from?.id || chatId) as number | string | undefined
  const text = String(message.text || '').trim()

  if (!chatId || !userId || !text) return

  if (!isAllowedChat(chatId)) {
    return
  }

  const command = getCommand(text)

  if (command === '/start' || command === '/help') {
    await sendTelegramMessage(chatId, [
      '🍝 Bot reservas Nonna Angela',
      '',
      'Comandos disponibles:',
      '/reservashoy — ver reservas de hoy',
      '/reservasdate — buscar reservas por fecha',
      '',
      'También puedes escribir /reservasdate 05-09-2026.'
    ].join('\n'))
    return
  }

  if (command === '/reservashoy') {
    const report = await getReservationsReport(getTodayDateValue())
    await sendLongTelegramMessage(chatId, report)
    return
  }

  if (command === '/reservasdate' || command === '/reservasfecha') {
    const inlineDate = parseDateValueFromText(getTextAfterCommand(text))

    if (inlineDate) {
      const report = await getReservationsReport(inlineDate)
      await sendLongTelegramMessage(chatId, report)
      return
    }

    await saveAwaitingDateSession(chatId, userId)
    await sendTelegramMessage(chatId, [
      '📅 ¿Qué fecha quieres consultar?',
      '',
      'Responde a este mensaje con la fecha en formato dd-mm-aaaa.',
      'Ejemplo: 05-09-2026',
      '',
      'También puedes usar directamente: /reservasdate 05-09-2026'
    ].join('\n'), {
      reply_markup: getForceDateReplyMarkup()
    })
    return
  }

  const session = await getAwaitingDateSession(chatId, userId)

  if (session?.state === SESSION_STATE_AWAITING_DATE) {
    const requestedDate = parseDateValueFromText(text)

    if (!requestedDate) {
      await sendTelegramMessage(chatId, 'Formato no reconocido. Responde con la fecha como 05-09-2026.', {
        reply_markup: getForceDateReplyMarkup()
      })
      return
    }

    await clearSession(chatId, userId)
    const report = await getReservationsReport(requestedDate)
    await sendLongTelegramMessage(chatId, report)
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: true, service: 'telegram-reservations-bot' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const update = await request.json().catch(() => ({}))
    const message = update.message || update.edited_message

    if (message) {
      await handleMessage(message)
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ ok: false, error: error?.message || 'Unexpected error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
