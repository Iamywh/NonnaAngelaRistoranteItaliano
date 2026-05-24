const fs = require("fs");
const path = require("path");

const MENU_DIR = path.join(__dirname, "..", "data", "menu");

const MENU_FILES = [
  "AntipastiCaldi.json",
  "AntipastiFreddi.json",
  "Contorni.json",
  "Dolci.json",
  "PrimiPiatti.json",
  "SecondiPiatti.json",
  "insalate.json",
];

function getProfitCategory(margin) {
  if (margin === null || margin === undefined || Number.isNaN(margin)) {
    return "da_calcolare";
  }

  if (margin >= 70) return "molto alta";
  if (margin >= 60) return "alta";
  if (margin >= 50) return "media-alta";
  if (margin >= 40) return "media";
  return "bassa";
}

function roundOneDecimal(value) {
  return Math.round(value * 10) / 10;
}

function recalculateItem(item) {
  const cost = item.food_cost_operativo;
  const price = item.prezzo_consigliato;

  // Case 1: simple price
  if (typeof cost === "number" && typeof price === "number" && price > 0) {
    const margin = roundOneDecimal(((price - cost) / price) * 100);
    item.margine_percentuale = margin;
    item.categoria_profitto = getProfitCategory(margin);
    return item;
  }

  // Case 2: structured price, example taglieri: { intero, mezzo }
  if (
    cost &&
    price &&
    typeof cost === "object" &&
    typeof price === "object"
  ) {
    const newMargins = {};
    const categories = [];

    for (const key of Object.keys(price)) {
      const variantCost = cost[key];
      const variantPrice = price[key];

      if (
        typeof variantCost === "number" &&
        typeof variantPrice === "number" &&
        variantPrice > 0
      ) {
        const margin = roundOneDecimal(
          ((variantPrice - variantCost) / variantPrice) * 100
        );

        newMargins[key] = margin;
        categories.push(getProfitCategory(margin));
      }
    }

    if (Object.keys(newMargins).length > 0) {
      item.margine_percentuale = newMargins;

      if (categories.includes("bassa")) item.categoria_profitto = "bassa";
      else if (categories.includes("media")) item.categoria_profitto = "media";
      else if (categories.includes("media-alta")) item.categoria_profitto = "media-alta";
      else if (categories.includes("alta")) item.categoria_profitto = "alta";
      else item.categoria_profitto = "molto alta";
    }

    return item;
  }

  // Case 3: incomplete data
  item.margine_percentuale = null;
  item.categoria_profitto = "da_calcolare";
  return item;
}

function processFile(fileName) {
  const filePath = path.join(MENU_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    console.warn(`Missing file: ${fileName}`);
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error(`${fileName} is not an array`);
  }

  const updated = data.map(recalculateItem);

  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf8");

  console.log(`Updated ${fileName}`);
}

for (const file of MENU_FILES) {
  processFile(file);
}

console.log("Menu margins recalculated successfully.");