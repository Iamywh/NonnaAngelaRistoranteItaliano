// Phase 13C/2: deterministic validation of the private aggregated loyalty RPC.
// No customer names, phones, emails, individual cards, or reservation records.
const count=(v,label)=>{
  if(!Number.isSafeInteger(v)||v<0)throw Error('Recuento inválido: '+label)
  return v
}
const cost=(v,label)=>{
  if(v===null)return null
  const n=Number(v)
  if(!Number.isFinite(n)||n<0||n>1000||
     Math.abs(Math.round(n*100)-n*100)>0.00001)
    throw Error('Coste unitario inválido: '+label)
  return n
}
const cents=(value,label)=>{
  const n=Number(value)
  if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100))||
    Math.abs(Math.round(n*100)-n*100)>0.00001)
    throw Error('Importe estimado inválido: '+label)
  return Math.round(n*100)
}
export function prepareLoyaltyEconomics(payload){
  if(!payload||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(payload.month)||
    !Array.isArray(payload.reward_types)||!Array.isArray(payload.visits_by_day)||
    !payload.card_progress_distribution||!payload.totals){
    throw Error('Datos de fidelización incompletos')
  }
  const t=payload.totals
  for(const key of ['issued_month','stamps_month','cards_visited_month','returning_cards_month',
    'redemptions_month','cards_total','cards_with_2plus_visits','rewards_outstanding',
    'reward_types_without_cost','redemptions_missing_cost','outstanding_missing_cost']){
    count(t[key],key)
  }
  if(t.issued_month>t.cards_total || t.cards_visited_month>t.stamps_month ||
     t.returning_cards_month>t.cards_visited_month ||
     t.cards_with_2plus_visits>t.cards_total ||
     t.outstanding_missing_cost>t.rewards_outstanding ||
     t.redemptions_missing_cost>t.redemptions_month){
    throw Error('Totales incoherentes entre tarjetas, visitas y premios')
  }
  const dist=payload.card_progress_distribution
  const totalProgress=['zero','one','two','three_four','five_plus']
    .reduce((sum,key)=>sum+count(dist[key],key),0)
  if(totalProgress!==t.cards_total)
    throw Error('La distribución de tarjetas no coincide con el total')
  const types=new Set()
  let issuedByTypes=0,rewardTypesMissing=0,redemptionsByTypes=0,availableByTypes=0
  let redemptionsUnpriced=0,availableUnpriced=0,redeemedCostCents=0,availableCostCents=0
  for(const r of payload.reward_types){
    if(typeof r.reward_label!=='string'||!r.reward_label.trim()||
      !Number.isInteger(r.reward_threshold)||r.reward_threshold<3||r.reward_threshold>12)
      throw Error('Tipo de recompensa inválido')
    const key=r.reward_label+'|'+r.reward_threshold
    if(types.has(key))throw Error('Tipo de recompensa duplicado')
    types.add(key)
    for(const field of ['issued_cards','active_cards','verified_visits_all_time',
      'redeemed_month','rewards_outstanding'])count(r[field],field)
    if(r.active_cards>r.issued_cards)throw Error('Tarjetas activas incoherentes')
    issuedByTypes+=r.issued_cards
    redemptionsByTypes+=r.redeemed_month
    availableByTypes+=r.rewards_outstanding
    const unit=cost(r.estimated_unit_cost,key)
    if(unit===null){
      rewardTypesMissing++
      redemptionsUnpriced+=r.redeemed_month
      availableUnpriced+=r.rewards_outstanding
    }else{
      const unitCents=Math.round(unit*100)
      redeemedCostCents+=r.redeemed_month*unitCents
      availableCostCents+=r.rewards_outstanding*unitCents
    }
  }
  if(issuedByTypes!==t.cards_total||rewardTypesMissing!==t.reward_types_without_cost||
    redemptionsByTypes!==t.redemptions_month||
    availableByTypes!==t.rewards_outstanding||
    redemptionsUnpriced!==t.redemptions_missing_cost||
    availableUnpriced!==t.outstanding_missing_cost||
    redeemedCostCents!==cents(t.estimated_redemption_cost_known,'premios entregados')||
    availableCostCents!==cents(t.estimated_outstanding_cost_known,'premios pendientes')){
    throw Error('Los desgloses económicos no coinciden con los totales')
  }
  const seenDays=new Set()
  let monthlyVisits=0
  for(const d of payload.visits_by_day){
    if(typeof d.date!=='string'||!d.date.startsWith(payload.month+'-')||
      !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(d.date)||
      seenDays.has(d.date))throw Error('Fecha de visitas inválida o duplicada')
    seenDays.add(d.date)
    monthlyVisits+=count(d.visits,'visitas por fecha')
  }
  if(monthlyVisits!==t.stamps_month)
    throw Error('Las visitas diarias no coinciden con el total')
  return {
    ...payload,
    repeatedAmongVisitingPercent:t.cards_visited_month===0?null:
      Math.round(1000*t.returning_cards_month/t.cards_visited_month)/10,
    twoPlusAmongExistingPercent:t.cards_total===0?null:
      Math.round(1000*t.cards_with_2plus_visits/t.cards_total)/10,
    estimatedRedemptionCostKnown:Number((redeemedCostCents/100).toFixed(2)),
    estimatedOutstandingCostKnown:Number((availableCostCents/100).toFixed(2)),
    redemptionsEstimatePartial: redemptionsUnpriced>0,
    outstandingEstimatePartial: availableUnpriced>0,
    // This is NOT an all-guest retention metric or actual P&L.
    financialDataIsEstimate:true
  }
}
