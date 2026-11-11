const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
const response = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
export function formatOrderMessage(order) {
  let text='NONNA ANGELA · Richiesta ordine\n'+order.orderNumber+'\n'
  let count=0
  for (const line of order.lines) {
    const item='\n• '+line.product+' — '+line.quantity+' '+line.unit+' ['+(line.supplierName||line.supplier)+']'+(line.notes?'\n  '+line.notes:'')
    if (text.length+item.length>3100) break
    text+=item;count++
  }
  if(count<order.lines.length)text+='\n… altre '+(order.lines.length-count)+' righe nello storico web.'
  return text+'\n\nRichiesta interna: verificare prima di ordinare al fornitore.\nhttps://nonnaangelaristorante.netlify.app/manager/orders'
}
// No retries after an ambiguous delivery: Telegram sendMessage has no idempotency key.
export function createOrderNotificationHandler(deps) {
  return async request => {
    if(request.method==='OPTIONS')return new Response('ok',{headers:cors})
    if(request.method!=='POST')return response({error:'Method not allowed'},405)
    const token=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if(!token)return response({error:'Accedi con un account staff.'},401)
    try {
      if(!await deps.verify(token))return response({error:'Sessione non valida.'},401)
      if(!await deps.authorize(token))return response({error:'Access denied'},403)
      const raw=await request.text()
      if(raw.length>300)return response({error:'Invalid request'},400)
      let body
      try{body=JSON.parse(raw)}catch{return response({error:'Invalid JSON'},400)}
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.order_id||''))return response({error:'Invalid order ID'},400)
      if(!deps.configured())return response({error:'Ordine salvato. Configura ORDERS_TELEGRAM_CHAT_ID e TELEGRAM_BOT_TOKEN in Supabase per notificare Manu.'},503)
      const claim=await deps.claim(body.order_id)
      if(!claim)return response({error:'Order not found'},404)
      if(claim.state!=='claimed')return response({state:claim.state})
      let state='uncertain'
      try {
        const result=await deps.send(formatOrderMessage(claim.order))
        if(result?.ok===true)state='sent'
        // Only an explicit Bot API rejection proves that nothing was sent.
        else if(result?.ok===false)state='failed'
      }catch{/* timeout or network disconnect could occur after Telegram accepted */}
      try {
        if(!await deps.finish(body.order_id,claim.attempt,state))return response({error:'Invio avviato; stato non aggiornato. Verifica Telegram prima di ripetere.'},503)
      }catch{return response({error:'Invio avviato; verifica Telegram e ricarica lo storico.'},503)}
      return response({state})
    }catch{return response({error:'Servizio temporaneamente non disponibile. L’ordine resta salvato: ricarica lo storico.'},503)}
  }
}
