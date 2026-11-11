import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createOrderNotificationHandler } from './handler.mjs'
const url=Deno.env.get('SUPABASE_URL')!
const anon=Deno.env.get('SUPABASE_ANON_KEY')!
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
const rpc=async(name:string,args:Record<string,unknown>)=>{
  const {data,error}=await admin.rpc(name,args)
  if(error)throw new Error('Database operation failed')
  return data
}
Deno.serve(createOrderNotificationHandler({
  verify:async(token:string)=>{
    const {data,error}=await admin.auth.getUser(token)
    return !error && Boolean(data.user)
  },
  authorize:async(token:string)=>{
    const client=createClient(url,anon,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}})
    const {data,error}=await client.rpc('procurement_authorized')
    if(error)throw new Error('Authorization failed')
    return data===true
  },
  configured:()=>Boolean(Deno.env.get('ORDERS_TELEGRAM_BOT_TOKEN') && Deno.env.get('ORDERS_TELEGRAM_CHAT_ID')),
  claim:(id:string)=>rpc('procurement_notify_claim',{p_id:id}),
  finish:(id:string,attempt:string,state:string)=>rpc('procurement_notify_finish',{p_id:id,p_attempt:attempt,p_state:state}),
  send:async(text:string)=>{
    const result=await fetch('https://api.telegram.org/bot'+Deno.env.get('ORDERS_TELEGRAM_BOT_TOKEN')+'/sendMessage',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),
      body:JSON.stringify({chat_id:Deno.env.get('ORDERS_TELEGRAM_CHAT_ID'),text,disable_web_page_preview:true})
    })
    return await result.json()
  }
}))
