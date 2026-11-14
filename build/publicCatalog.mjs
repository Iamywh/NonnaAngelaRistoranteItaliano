// Build-time boundary: private values must never reach a downloadable chunk.
export const PRIVATE_CATALOG_FIELDS = new Set([
 'food_cost_raw','food_cost_operativo','margine_percentuale','categoria_profitto',
 'cost_price','purchase_price','purchase_units','fornitore','coperto_da_ordine',
 'warning_commerciale','pricing_rule'
])
export function publicCatalog(value) {
 if(Array.isArray(value)) return value.map(publicCatalog)
 if(value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
   .filter(([key])=>!PRIVATE_CATALOG_FIELDS.has(key)).map(([key,child])=>[key,publicCatalog(child)]))
 return value
}
export function publicCatalogPlugin() {
 return {name:'public-catalog-boundary',enforce:'pre',transform(code,id){
  const path=id.split('?')[0].replaceAll('\\','/')
  if(!path.endsWith('.json') || !/(\/data\/menu\/|\/src\/data\/)/.test(path))return null
  return {code:JSON.stringify(publicCatalog(JSON.parse(code))),map:null}
 }}
}
