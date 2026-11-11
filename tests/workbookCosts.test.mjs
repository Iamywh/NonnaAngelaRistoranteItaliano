import test from 'node:test'
import assert from 'node:assert/strict'
import {calculateCostScenario,joinWorkbookMenu} from '../src/lib/workbookCosts.mjs'
const params={fixed_monthly:20000,covers:600,dishes_per_cover:2,kitchen_share:.7,tax_rate:.07,raw_target:.25,margin_target:.1,open_days:26,ticket:40}
test('20k fixed budget is counted once; per-dish allocation is separate',()=>{
 const r=calculateCostScenario(params)
 assert.ok(Math.abs(r.breakEvenGross-28533.333333)<.001)
 assert.ok(Math.abs(r.targetGross-32923.076923)<.001)
 assert.ok(Math.abs(r.operatingResidual-(24000/1.07*.75-20000))<.001)
 assert.ok(Math.abs(r.allocatedPerDish-14000/1200)<.001)
})
test('invalid targets and empty business dimensions do not produce misleading margins',()=>{
 for(const delta of [{covers:0},{open_days:32},{ticket:0},{raw_target:.95},{tax_rate:-.01},{fixed_monthly:NaN}])assert.equal(calculateCostScenario({...params,...delta}),null)
})
test('recipe mismatch stays uncosted until approved; current public price wins',()=>{
 const menu=[{id:'carbonara',price:20.5},{id:'amatriciana',price:19},{id:'missing',price:25}]
 const rows=[{id:'a',menu_key:'carbonara',approved:true,raw_cost:2.7,source_price:14},{id:'b',menu_key:'amatriciana',approved:false,raw_cost:2.08,source_price:14}]
 const [a,b,c]=joinWorkbookMenu(menu,{params,rows})
 assert.equal(a.price,20.5);assert.equal(a.source.source_price,14)
 assert.ok(Math.abs(a.contribution-(20.5/1.07-2.7))<.00001)
 assert.equal(b.rawCost,null);assert.equal(c.rawCost,null)
})
