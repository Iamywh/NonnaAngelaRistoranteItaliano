const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

function readJson(relativePath) {
    const fullPath = path.join(ROOT, relativePath)
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'))
}

function writeJson(relativePath, data) {
    const fullPath = path.join(ROOT, relativePath)
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8')
}

function getPriceForMenuItem(manuPrices, menuItemId) {
    return manuPrices.prices.find((item) => item.menu_item_id === menuItemId) || null
}

function getCostAlias(aliases, ingredientId) {
    const alias = aliases.aliases.find((item) => item.ingredient_id === ingredientId)
    return alias ? alias.cost_ingredient_id : ingredientId
}

function getUnitCost(unitCosts, costIngredientId) {
    return unitCosts.unit_costs.find((item) => item.ingredient_id === costIngredientId) || null
}

function calculateReport() {
    const recipes = readJson('data/costing/recipesCosting.json')
    const unitCosts = readJson('data/costing/ingredientUnitCosts.json')
    const aliases = readJson('data/costing/ingredientCostAliases.json')
    const manuPrices = readJson('data/pricing/manuPrices.json')

    const reportItems = recipes.recipes.map((recipe) => {
        const priceData = getPriceForMenuItem(manuPrices, recipe.menu_item_id)

        let totalCost = 0
        const warnings = []
        const ingredientLines = recipe.ingredients.map((ingredient) => {
            const costIngredientId = getCostAlias(aliases, ingredient.ingredient_id)
            const unitCostData = getUnitCost(unitCosts, costIngredientId)

            if (!unitCostData) {
                warnings.push(`Missing unit cost for ${ingredient.ingredient_id}`)
                return {
                    ...ingredient,
                    cost_ingredient_id: costIngredientId,
                    unit_cost: null,
                    line_cost: null,
                    costing_status: 'missing_unit_cost'
                }
            }

            if (ingredient.unit !== unitCostData.unit) {
                warnings.push(
                    `Unit mismatch for ${ingredient.ingredient_id}: recipe uses ${ingredient.unit}, cost uses ${unitCostData.unit}`
                )
            }

            const lineCost = Number((ingredient.quantity * unitCostData.unit_cost).toFixed(2))
            totalCost += lineCost

            return {
                ...ingredient,
                cost_ingredient_id: costIngredientId,
                unit_cost: unitCostData.unit_cost,
                line_cost: lineCost,
                costing_status: 'ok'
            }
        })

        const OPERATIONAL_BUFFER_PERCENT = 15

        const rawCost = Number(totalCost.toFixed(2))
        const operationalCost = Number((rawCost * (1 + OPERATIONAL_BUFFER_PERCENT / 100)).toFixed(2))

        const salePrice = priceData?.price ?? null

        const foodCostPercent =
            salePrice && operationalCost > 0
                ? Number(((operationalCost / salePrice) * 100).toFixed(1))
                : null

        const grossMargin =
            salePrice && operationalCost > 0
                ? Number((salePrice - operationalCost).toFixed(2))
                : null

        return {
            menu_item_id: recipe.menu_item_id,
            name_it: recipe.name_it,
            category: recipe.category,
            sale_price: salePrice,
            raw_food_cost: rawCost,
            operational_buffer_percent: OPERATIONAL_BUFFER_PERCENT,
            estimated_cost: operationalCost,
            food_cost_percent: foodCostPercent,
            gross_margin: grossMargin,
            costing_status: warnings.length ? 'partial' : 'complete',
            warnings,
            ingredients: ingredientLines
        }
    })

    const report = {
        currency: 'EUR',
        status: 'generated',
        generated_at: new Date().toISOString(),
        notes:
            'Generated from recipesCosting.json, ingredientUnitCosts.json, ingredientCostAliases.json and manuPrices.json.',
        items: reportItems
    }

    writeJson('data/costing/menuCostReport.json', report)
    console.log(`Menu cost report generated with ${reportItems.length} items.`)
}

calculateReport()