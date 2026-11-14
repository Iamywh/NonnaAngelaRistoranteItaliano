import test from 'node:test'
import assert from 'node:assert/strict'
import {publicCatalog,publicCatalogPlugin} from '../build/publicCatalog.mjs'
test('private prices removed recursively before JSON reaches any browser module',()=>{
 const source={wines:[{name:'Test',cost_price:123456.78,recommended_bottle_price:30}],nested:{food_cost_raw:987654.32,margine_percentuale:82}}
 const projected=publicCatalog(source)
 assert.deepEqual(projected,{wines:[{name:'Test',recommended_bottle_price:30}],nested:{}})
 const output=publicCatalogPlugin().transform(JSON.stringify(source),'/app/data/menu/vini.json').code
 assert.doesNotMatch(output,/123456|987654|cost_price|margine_percentuale/)
 assert.equal(source.wines[0].cost_price,123456.78)
})
