// Telegram webhook for PRIVATE Analytics data entry. Completely separate from reservations.
// Authentication: Telegram webhook secret header + strict sender/chat allowlist.
// Both daily revenue and expense-total wizards use one atomic service-only PostgreSQL RPC.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'

function json(payload:Record<string,unknown>,status=200){
  return new Response(JSON.stringify(payload),{status,headers:{
    'Content-Type':'application/json','Cache-Control':'no-store'
  }})
}
function safeMatch(received:string,expected:string){
  // No public web entry if the configured secret is missing or weak.
  if(expected.length<32||received.length!==expected.length)return false
  let diff=0
  for(let i=0;i<expected.length;i++)diff|=received.charCodeAt(i)^expected.charCodeAt(i)
  return diff===0
}
async function sendMessage(token:string,chatId:string,reply:string){
  const response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text:reply,disable_web_page_preview:true}),
    signal:AbortSignal.timeout(10000)
  })
  if(!response.ok)throw Error('Telegram sendMessage failed')
}

Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  const expected=Deno.env.get('ANALYTICS_TELEGRAM_WEBHOOK_SECRET')||''
  const received=request.headers.get('x-telegram-bot-api-secret-token')||''
  if(!safeMatch(received,expected))return json({error:'Unauthorized'},401)

  const token=Deno.env.get('ANALYTICS_TELEGRAM_BOT_TOKEN')||''
  const reservationBot=Deno.env.get('TELEGRAM_BOT_TOKEN')
  const allowedChat=Deno.env.get('ANALYTICS_TELEGRAM_CHAT_ID')||''
  const allowedSender=Deno.env.get('ANALYTICS_TELEGRAM_USER_ID')||''
  const actor=Deno.env.get('ANALYTICS_ENTRY_ACTOR_UID')||''
  const url=Deno.env.get('SUPABASE_URL')
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!token||!allowedChat||!allowedSender||!actor||!url||!key||
     (reservationBot&&token===reservationBot))
    return json({error:'Server configuration unavailable'},503)

  // Telegram webhooks are private data; no untrusted payload may provide
  // the actor, allowed sender, destination, amounts-to-save API, or dates.
  const contentLength=Number(request.headers.get('content-length')||'0')
  if(contentLength>20000)return json({error:'Payload too large'},413)
  const update=await request.json().catch(()=>null)
  if(!update||typeof update.update_id!=='number'||
    !Number.isSafeInteger(update.update_id)||update.update_id<0)
    return json({error:'Invalid Telegram update'},400)
  const message=update.message
  if(!message||typeof message.text!=='string')return json({ok:true,ignored:true})
  const chat=message.chat
  const from=message.from
  if(!chat||!from||chat.type!=='private'||
    String(chat.id)!==allowedChat||String(from.id)!==allowedSender)
    return json({ok:true,ignored:true})
  if(message.text.length>100)return json({ok:true,ignored:true})

  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  try{
    const {data,error}=await db.rpc('analytics_telegram_entry_process',{
      p_chat_id:allowedChat,
      p_sender_id:allowedSender,
      p_update_id:update.update_id,
      p_text:message.text,
      p_actor:actor
    })
    if(error||!data?.ok||typeof data.reply!=='string'){
      console.error('Analytics entry RPC failed (no payload logged)')
      return json({error:'Entry processing unavailable'},503)
    }
    if(data.reply)await sendMessage(token,allowedChat,data.reply)
    return json({ok:true,duplicate:!!data.duplicate,saved:!!(data.saved_day_id||data.saved_expense_id)})
  }catch{
    // Non-2xx prompts Telegram to retry; the database receipt makes the
    // accounting write idempotent even if the first reply was delivered.
    return json({error:'Entry delivery unavailable'},503)
  }
})
