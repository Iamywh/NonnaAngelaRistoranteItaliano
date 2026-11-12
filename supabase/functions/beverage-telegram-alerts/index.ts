import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createBeverageAlertHandler } from './handler.mjs'
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
const rpc=async(name:string,args:Record<string,unknown>={})=>{
 const {data,error}=await db.rpc(name,args)
 if(error)throw new Error('Database operation failed')
 return data
}
Deno.serve(createBeverageAlertHandler({
 authorize:(secret:string)=>rpc('beverage_alert_authorize',{p_secret:secret}),
 configured:()=>Boolean(Deno.env.get('ORDERS_TELEGRAM_BOT_TOKEN')&&Deno.env.get('ORDERS_TELEGRAM_CHAT_ID')),
 claim:()=>rpc('beverage_alert_claim'),
 finish:(id:string,attempt:string,state:string,error:string|null)=>rpc('beverage_alert_finish',{p_id:id,p_attempt:attempt,p_state:state,p_error:error}),
 send:async(text:string)=>{
  const res=await fetch('https://api.telegram.org/bot'+Deno.env.get('ORDERS_TELEGRAM_BOT_TOKEN')+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),
   body:JSON.stringify({chat_id:Deno.env.get('ORDERS_TELEGRAM_CHAT_ID'),text,disable_web_page_preview:true})
  })
  return await res.json()
 },
 pause:()=>new Promise(resolve=>setTimeout(resolve,3100))
}))
