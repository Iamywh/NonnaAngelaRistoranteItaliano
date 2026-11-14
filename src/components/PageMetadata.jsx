import {useEffect} from 'react'
import {useLanguage} from '../i18n/LanguageContext.jsx'
const origin='https://nonnaangelaristorante.netlify.app'
const descriptions={
 es:'Restaurante italiano en Santa Cruz de Tenerife. Consulta la carta, los vinos y solicita tu reserva.',
 en:'Italian restaurant in Santa Cruz de Tenerife. Explore the menu and wines and request a reservation.',
 it:'Ristorante italiano a Santa Cruz de Tenerife. Scopri il menu e i vini e invia una richiesta di prenotazione.',
 fr:'Restaurant italien à Santa Cruz de Tenerife. Découvrez la carte et les vins et demandez une réservation.'
}
export default function PageMetadata({page,path}){
 const {language,t}=useLanguage()
 useEffect(()=>{
  const privatePage=page.startsWith('admin')||page==='account'
  const label=['home','locale','menu','bebidas'].includes(page)?t(`nav.${page}`):page==='famiglia'?'La Famiglia':'Manager'
  document.title=`${label} · Nonna Angela Ristorante Italiano`
  document.querySelector('meta[name="description"]')?.setAttribute('content',descriptions[language]||descriptions.es)
  document.querySelector('link[rel="canonical"]')?.setAttribute('href',origin+path)
  let robots=document.querySelector('meta[name="robots"]')
  if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots)}
  robots.content=privatePage?'noindex, nofollow':'index, follow'
 },[page,path,language,t])
 return null
}
