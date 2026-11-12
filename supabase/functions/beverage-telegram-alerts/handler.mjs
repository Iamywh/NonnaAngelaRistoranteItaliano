const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
export function createBeverageAlertHandler(deps){
 return async request=>{
  if(request.method!=='POST')return reply({error:'Method not allowed'},405)
  const secret=request.headers.get('x-beverage-ticket')||''
  if(!/^[0-9a-f]{64}$/.test(secret))return reply({error:'Unauthorized'},401)
  try{
   if(!await deps.authorize(secret))return reply({error:'Unauthorized'},401)
   if(!deps.configured())return reply({error:'Orders Telegram configuration missing'},503)
   let sent=0,failed=0,uncertain=0
   // Bounded batch: per-message durable claims; concurrent workers cannot duplicate sends.
   for(let i=0;i<5;i++){
    const job=await deps.claim()
    if(!job)break
    let state='uncertain',error='network_or_invalid_response'
    try{
     const result=await deps.send(job.text)
     if(result?.ok===true){state='sent';error=null}
     else if(result?.ok===false){state='failed';error='telegram_'+(Number.isInteger(result.error_code)?result.error_code:'rejected')}
    }catch{/* Telegram may already have accepted: never automatically retry. */}
    if(!await deps.finish(job.id,job.attempt,state,error))throw Error('Delivery state unavailable')
    if(state==='sent')sent++
    else if(state==='failed')failed++
    else uncertain++
    // Stop on rejection/ambiguity, including rate limits, instead of flooding Telegram.
    if(state!=='sent')break
    await deps.pause()
   }
   return reply({ok:failed+uncertain===0,sent,failed,uncertain},failed+uncertain?502:200)
  }catch{return reply({error:'Beverage alert processing unavailable'},503)}
 }
}
