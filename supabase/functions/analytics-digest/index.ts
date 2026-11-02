import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
})
function canaryDate(now:Date){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Atlantic/Canary',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'
  }).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))
  return {date:parts.year+'-'+parts.month+'-'+parts.day,monday:parts.weekday==='Mon'}
}
async function sameSecret(a:string,b:string){
  if(!a||!b||b.length<32)return false
  const enc=new TextEncoder()
  const [left,right]=await Promise.all([
    crypto.subtle.digest('SHA-256',enc.encode(a)),
    crypto.subtle.digest('SHA-256',enc.encode(b))
  ])
  const x=new Uint8Array(left),y=new Uint8Array(right)
  let diff=0
  for(let i=0;i<x.length;i++)diff|=x[i]^y[i]
  return diff===0
}

Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  const secret=Deno.env.get('ANALYTICS_CRON_SECRET')||''
  if(!await sameSecret(request.headers.get('x-analytics-cron-secret')||'',secret))
    return json({error:'Unauthorized'},401)
  const url=Deno.env.get('SUPABASE_URL')
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!serviceKey)return json({error:'Server configuration unavailable'},503)
  const db=createClient(url,serviceKey,{
    auth:{persistSession:false,autoRefreshToken:false}
  })
  const clock=canaryDate(new Date())
  const cadence=clock.monday?['daily','weekly']:['daily']
  let created=0,skipped=0,delivered=0,deliveryFailed=0
  try{
    for(const frequency of cadence){
      // Server derives date and frequency; request bodies cannot forge data or dates.
      const {data,error}=await db.rpc('analytics_generate_notification_digest',{
        p_cadence:frequency,p_local_date:clock.date
      })
      if(error)throw Error('Digest RPC unavailable')
      if(!data?.id){skipped++;continue}
      if(data.created)created++
      // Separate financial channel and explicit opt-in. Never reuse the reservation
      // chat destination as a fallback.
      const token=Deno.env.get('ANALYTICS_TELEGRAM_BOT_TOKEN')
      // Never use the same bot identity as the reservations channel, even
      // if someone accidentally configures the Analytics secret incorrectly.
      if(token && token===Deno.env.get('TELEGRAM_BOT_TOKEN')){
        return json({ok:false,error:'Analytics Telegram bot must be different from reservations bot'},503)
      }
      const chat=Deno.env.get('ANALYTICS_TELEGRAM_CHAT_ID')
      if(!token||!chat){
        // In-app digest is still generated; Telegram pending stays pending
        // until the owner configures secrets and reruns the same date.
        continue
      }
      const {data:reserved,error:reservationError}=
        await db.rpc('analytics_reserve_notification_telegram',{p_id:data.id})
      if(reservationError)throw Error('Notification dispatch unavailable')
      if(!reserved)continue
      let success=false,errorCode:string|null=null
      try{
        const telegram=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            chat_id:chat,text:reserved.text,disable_web_page_preview:true
          }),
          signal:AbortSignal.timeout(10000)
        })
        success=telegram.ok
        if(!success)errorCode='Telegram HTTP '+telegram.status
      }catch{
        errorCode='Telegram network failure'
      }
      // Never retry an ambiguous send automatically: at-most-one attempt.
      const {error:completeError}=await db.rpc('analytics_complete_notification_telegram',{
        p_id:data.id,p_success:success,p_error:errorCode
      })
      if(completeError)throw Error('Delivery state could not be finalized')
      if(success)delivered++;else deliveryFailed++
    }
    if(deliveryFailed)return json({
      ok:false,created,skipped,delivered,deliveryFailed,
      reason:'Telegram delivery failed; check private Analytics inbox and Supabase logs'
    },502)
    return json({ok:true,created,skipped,delivered,deliveryFailed})
  }catch{
    return json({ok:false,error:'Digest execution failed; check Supabase logs'},500)
  }
})
