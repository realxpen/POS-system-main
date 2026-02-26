import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate } from './middleware/auth';

const router = Router();
router.use(authenticate);

const round2 = (n: number) => Math.round(n * 100) / 100;

router.get('/product/:productId', (req, res) => {
  const db = getDb();
  const productId = Number(req.params.productId);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const ingredients = db.prepare(`
    SELECT
      pr.material_id,
      pr.quantity_required,
      m.name as material_name,
      m.unit,
      m.unit_cost
    FROM product_recipes pr
    JOIN materials m ON m.id = pr.material_id
    WHERE pr.product_id = ?
  `).all(productId) as any[];

  const ingredientCost = ingredients.reduce((sum, i) => sum + Number(i.quantity_required) * Number(i.unit_cost || 0), 0);
  const baseCost = ingredientCost > 0 ? ingredientCost : Number(product.cost_price || 0);

  const safePrice = product.safe_price != null ? Number(product.safe_price) : baseCost;
  const standardPrice = product.standard_price != null ? Number(product.standard_price) : baseCost * 1.25;
  const premiumPrice = product.premium_price != null ? Number(product.premium_price) : baseCost * 1.5;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  res.json({
    product_id: productId,
    product_name: product.name,
    base_cost: round2(baseCost),
    ingredient_cost: round2(ingredientCost),
    ingredients,
    pricing: {
      safe: round2(safePrice),
      standard: round2(standardPrice),
      premium: round2(premiumPrice),
    },
    profit_per_sale: {
      safe: round2(safePrice - baseCost),
      standard: round2(standardPrice - baseCost),
      premium: round2(premiumPrice - baseCost),
    },
  });
});

router.put('/product/:productId/pricing', (req, res) => {
  const db = getDb();
  const productId = Number(req.params.productId);
  const { safe_price, standard_price, premium_price } = req.body;
  db.prepare(`
    UPDATE products
    SET safe_price = ?, standard_price = ?, premium_price = ?
    WHERE id = ?
  `).run(
    safe_price != null ? Number(safe_price) : null,
    standard_price != null ? Number(standard_price) : null,
    premium_price != null ? Number(premium_price) : null,
    productId,
  );
  res.json({ success: true });
});

router.post('/quick-estimate', (req, res) => {
  const {
    item_type,
    direct_cost,
    hours,
    hourly_rate,
    operating_share,
    risk_buffer_pct,
    target_margin_pct,
  } = req.body || {};

  const type = String(item_type || 'product').toLowerCase();
  const direct = Math.max(0, Number(direct_cost || 0));
  const durationHours = Math.max(0, Number(hours || 0));
  const hourly = Math.max(0, Number(hourly_rate || 0));
  const operating = Math.max(0, Number(operating_share || 0));
  const riskPct = Math.max(0, Number(risk_buffer_pct || 0));
  const marginPct = Math.min(95, Math.max(0, Number(target_margin_pct || 0)));

  const timeCost = durationHours * hourly;
  const preRisk = direct + timeCost + operating;
  const riskBuffer = preRisk * (riskPct / 100);
  const baseCost = preRisk + riskBuffer;

  const safeMultiplier = 1.1;
  const standardMultiplier = 1.35;
  const premiumMultiplier = 1.6;

  const suggestedByMargin = marginPct >= 100 ? baseCost : (baseCost / (1 - marginPct / 100));

  res.json({
    item_type: type === 'service' ? 'service' : 'product',
    formula: 'Base Cost = Direct Cost + Time Cost + Operating Share + Risk Buffer',
    inputs: {
      direct_cost: round2(direct),
      hours: round2(durationHours),
      hourly_rate: round2(hourly),
      operating_share: round2(operating),
      risk_buffer_pct: round2(riskPct),
      target_margin_pct: round2(marginPct),
    },
    breakdown: {
      time_cost: round2(timeCost),
      pre_risk_cost: round2(preRisk),
      risk_buffer: round2(riskBuffer),
      base_cost: round2(baseCost),
    },
    pricing: {
      safe: round2(baseCost * safeMultiplier),
      standard: round2(baseCost * standardMultiplier),
      premium: round2(baseCost * premiumMultiplier),
      suggested_by_target_margin: round2(suggestedByMargin),
    },
    margin_reference: {
      safe: 10,
      standard: 35,
      premium: 60,
    },
  });
});

router.post('/catering-estimate', (req, res) => {
  const {
    guests,
    portion_factor,
    ingredients,
    packaging_per_plate,
    labor_total,
    transport_total,
    fuel_total,
    venue_service_total,
    contingency_pct,
    target_margin_pct,
  } = req.body || {};

  const guestCount = Math.max(1, Number(guests || 0));
  const portionInput = String(portion_factor || 'normal').toLowerCase();
  const portionMultiplier = portionInput === 'light' ? 0.9 : portionInput === 'heavy' ? 1.2 : 1;

  const ingredientRows = Array.isArray(ingredients) ? ingredients : [];
  const normalizedIngredients = ingredientRows.map((row: any, index: number) => {
    const qty = Math.max(0, Number(row?.quantity || 0));
    const unitCost = Math.max(0, Number(row?.unit_cost || 0));
    const totalCost = qty * unitCost;
    return {
      index,
      name: String(row?.name || `Ingredient ${index + 1}`),
      quantity: round2(qty),
      unit_cost: round2(unitCost),
      total_cost: round2(totalCost),
    };
  });

  const ingredientTotal = normalizedIngredients.reduce((sum, row) => sum + Number(row.total_cost), 0);
  const packagingTotal = Math.max(0, Number(packaging_per_plate || 0)) * guestCount;
  const laborTotal = Math.max(0, Number(labor_total || 0));
  const transportTotal = Math.max(0, Number(transport_total || 0));
  const fuelTotal = Math.max(0, Number(fuel_total || 0));
  const venueTotal = Math.max(0, Number(venue_service_total || 0));
  const contingencyPct = Math.max(0, Number(contingency_pct || 0));
  const marginPct = Math.min(95, Math.max(0, Number(target_margin_pct || 0)));

  const adjustedIngredientTotal = ingredientTotal * portionMultiplier;
  const totalCostBeforeContingency =
    adjustedIngredientTotal +
    packagingTotal +
    laborTotal +
    transportTotal +
    fuelTotal +
    venueTotal;

  const contingencyAmount = totalCostBeforeContingency * (contingencyPct / 100);
  const finalTotalCost = totalCostBeforeContingency + contingencyAmount;
  const costPerPlate = finalTotalCost / guestCount;
  const suggestedPricePerPlate = costPerPlate / (1 - marginPct / 100);
  const totalQuote = suggestedPricePerPlate * guestCount;
  const expectedProfit = totalQuote - finalTotalCost;

  const safePerPlate = costPerPlate * 1.1;
  const standardPerPlate = costPerPlate * 1.35;
  const premiumPerPlate = costPerPlate * 1.6;

  res.json({
    inputs: {
      guests: guestCount,
      portion_factor: portionInput === 'light' || portionInput === 'heavy' ? portionInput : 'normal',
      portion_multiplier: portionMultiplier,
      packaging_per_plate: round2(Number(packaging_per_plate || 0)),
      labor_total: round2(laborTotal),
      transport_total: round2(transportTotal),
      fuel_total: round2(fuelTotal),
      venue_service_total: round2(venueTotal),
      contingency_pct: round2(contingencyPct),
      target_margin_pct: round2(marginPct),
    },
    ingredients: normalizedIngredients,
    formulas: {
      ingredient_total: 'sum(quantity x unit_cost)',
      per_plate_base: '(ingredient + packaging + labor + transport + fuel + venue) / guests',
      contingency: 'total_cost x contingency%',
      final_total_cost: 'total_cost + contingency',
      suggested_price_per_plate: 'cost_per_plate / (1 - margin%)',
    },
    breakdown: {
      ingredient_total: round2(adjustedIngredientTotal),
      packaging_total: round2(packagingTotal),
      labor_total: round2(laborTotal),
      transport_total: round2(transportTotal),
      fuel_total: round2(fuelTotal),
      venue_service_total: round2(venueTotal),
      total_cost_before_contingency: round2(totalCostBeforeContingency),
      contingency_amount: round2(contingencyAmount),
      final_total_cost: round2(finalTotalCost),
      cost_per_plate: round2(costPerPlate),
    },
    pricing: {
      safe_per_plate: round2(safePerPlate),
      standard_per_plate: round2(standardPerPlate),
      premium_per_plate: round2(premiumPerPlate),
      suggested_per_plate: round2(suggestedPricePerPlate),
      total_quote: round2(totalQuote),
      expected_profit: round2(expectedProfit),
    },
  });
});

export default router;
