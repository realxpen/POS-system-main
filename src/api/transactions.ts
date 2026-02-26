import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate } from './middleware/auth';

const router = Router();
router.use(authenticate);

function makeInvoiceNumber() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${year}${month}${day}-${rand}`;
}

router.get('/', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const transactions = user.role === 'attendant'
    ? db.prepare(`
        SELECT * FROM transactions
        WHERE attendant_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(user.id)
    : db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50').all();

  res.json(transactions);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as any;
  if (transaction) {
    if (user.role === 'attendant' && transaction.attendant_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id = ?').all(req.params.id);
    const invoice = db.prepare('SELECT * FROM invoices WHERE transaction_id = ?').get(req.params.id);
    res.json({ ...transaction, items, invoice });
  } else {
    res.status(404).json({ error: 'Transaction not found' });
  }
});

router.post('/', (req, res) => {
  const { customer_name, customer_id, items, payment_method, tax_rate, prices_include_vat, branch_id, amount_paid, due_date } = req.body;
  const db = getDb();
  const user = req.user!;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  const createTransaction = db.transaction(() => {
    const isVatInclusive = prices_include_vat !== false;
    let subtotalExclusive = 0;
    let totalInclusive = 0;
    
    // Calculate subtotal and verify stock
    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;
      if (!product) throw new Error(`Product ${item.product_id} not found`);
      if (product.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

      const priceType = String(item.price_type || 'standard');
      const unitPrice =
        priceType === 'safe'
          ? Number(product.safe_price ?? product.selling_price)
          : priceType === 'premium'
            ? Number(product.premium_price ?? product.selling_price)
            : Number(product.standard_price ?? product.selling_price);

      // Check ingredient/material availability for recipe-based products
      const recipeRows = db.prepare(`
        SELECT material_id, quantity_required
        FROM product_recipes
        WHERE product_id = ?
      `).all(item.product_id) as any[];
      for (const recipe of recipeRows) {
        const mat = db.prepare('SELECT id, name, quantity FROM materials WHERE id = ?').get(recipe.material_id) as any;
        if (!mat) throw new Error(`Missing material #${recipe.material_id} for ${product.name}`);
        const requiredQty = Number(recipe.quantity_required) * Number(item.quantity);
        if (Number(mat.quantity) < requiredQty) {
          throw new Error(`Insufficient ingredient ${mat.name} for ${product.name}`);
        }
      }
    }

    const configuredTax = db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any;
    const effectiveTaxRate = Number.isFinite(Number(tax_rate))
      ? Number(tax_rate)
      : Number(configuredTax?.tax_rate || 0);

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;
      const priceType = String(item.price_type || 'standard');
      const baseUnitPrice =
        priceType === 'safe'
          ? Number(product.safe_price ?? product.selling_price)
          : priceType === 'premium'
            ? Number(product.premium_price ?? product.selling_price)
            : Number(product.standard_price ?? product.selling_price);

      const chargedUnitPrice = isVatInclusive ? baseUnitPrice * (1 + effectiveTaxRate / 100) : baseUnitPrice;
      const lineTotal = chargedUnitPrice * item.quantity;
      totalInclusive += lineTotal;
      subtotalExclusive += isVatInclusive ? lineTotal / (1 + effectiveTaxRate / 100) : lineTotal;
    }

    const tax_amount = totalInclusive - subtotalExclusive;
    const total_amount = totalInclusive;
    const invoiceNumber = makeInvoiceNumber();

    const resolvedBranchId = Number(branch_id || user.branch_id || 1);
    let resolvedCustomerId = customer_id ? Number(customer_id) : null;
    if (!resolvedCustomerId && customer_name && customer_name !== 'Walk-in Customer') {
      const existingCustomer = db.prepare('SELECT id FROM customers WHERE lower(full_name) = lower(?) LIMIT 1').get(customer_name) as any;
      if (existingCustomer) {
        resolvedCustomerId = Number(existingCustomer.id);
      } else {
        const createCustomer = db.prepare(`
          INSERT INTO customers (full_name)
          VALUES (?)
        `).run(customer_name);
        resolvedCustomerId = Number(createCustomer.lastInsertRowid);
      }
    }

    // Insert Transaction
    const stmt = db.prepare(`
      INSERT INTO transactions (invoice_number, customer_name, subtotal, tax_amount, total_amount, payment_method, attendant_id, attendant_name, customer_id, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      invoiceNumber,
      customer_name || 'Walk-in Customer',
      subtotalExclusive,
      tax_amount,
      total_amount,
      payment_method,
      user.id,
      user.full_name,
      resolvedCustomerId,
      resolvedBranchId,
    );
    const transactionId = info.lastInsertRowid;

    // Insert Items and Update Stock
    const insertItem = db.prepare(`
      INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const updateStock = db.prepare(`
      UPDATE products
      SET quantity = quantity - ?
      WHERE id = ?
    `);
    const insertStockLog = db.prepare(`
      INSERT INTO stock_logs (
        product_id,
        change_type,
        quantity_before,
        quantity_changed,
        quantity_after,
        reference_type,
        reference_id,
        notes
      ) VALUES (?, 'sale', ?, ?, ?, 'transaction', ?, ?)
    `);

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;
      const priceType = String(item.price_type || 'standard');
      const unitPrice =
        priceType === 'safe'
          ? Number(product.safe_price ?? product.selling_price)
          : priceType === 'premium'
            ? Number(product.premium_price ?? product.selling_price)
            : Number(product.standard_price ?? product.selling_price);
      const chargedUnitPrice = isVatInclusive ? unitPrice * (1 + effectiveTaxRate / 100) : unitPrice;
      insertItem.run(transactionId, item.product_id, product.name, item.quantity, chargedUnitPrice, chargedUnitPrice * item.quantity);
      updateStock.run(item.quantity, item.product_id);
      insertStockLog.run(
        item.product_id,
        product.quantity,
        -Math.abs(item.quantity),
        product.quantity - item.quantity,
        transactionId,
        `Sold via ${invoiceNumber}`,
      );

      // Consume recipe materials per sold quantity
      const recipeRows = db.prepare(`
        SELECT material_id, quantity_required
        FROM product_recipes
        WHERE product_id = ?
      `).all(item.product_id) as any[];
      for (const recipe of recipeRows) {
        const material = db.prepare('SELECT id, quantity FROM materials WHERE id = ?').get(recipe.material_id) as any;
        if (!material) continue;
        const useQty = Number(recipe.quantity_required) * Number(item.quantity);
        db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(useQty, recipe.material_id);
        db.prepare(`
          INSERT INTO material_logs (
            material_id, change_type, quantity_before, quantity_changed, quantity_after, reference_type, reference_id, notes
          ) VALUES (?, 'sale_usage', ?, ?, ?, 'transaction', ?, ?)
        `).run(
          recipe.material_id,
          material.quantity,
          -useQty,
          Number(material.quantity) - useQty,
          transactionId,
          `Used for sale ${invoiceNumber} (${product.name})`,
        );
      }
    }

    const invoiceInfo = db.prepare(`
      INSERT INTO invoices (
        invoice_number,
        transaction_id,
        customer_name,
        attendant_id,
        attendant_name,
        payment_method,
        subtotal,
        tax_amount,
        total_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNumber,
      transactionId,
      customer_name || 'Walk-in Customer',
      user.id,
      user.full_name,
      payment_method,
      subtotalExclusive,
      tax_amount,
      total_amount,
    );

    if (String(payment_method).toLowerCase() === 'credit') {
      const paidNow = Number(amount_paid || 0);
      const balance = Math.max(0, total_amount - paidNow);
      const status = balance <= 0 ? 'paid' : paidNow > 0 ? 'partial' : 'unpaid';
      db.prepare(`
        INSERT INTO credit_sales (transaction_id, customer_id, total_amount, amount_paid, balance, status, due_date, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        transactionId,
        resolvedCustomerId,
        total_amount,
        paidNow,
        balance,
        status,
        due_date || null,
      );
    }

    return {
      transactionId,
      invoiceId: Number(invoiceInfo.lastInsertRowid),
      invoiceNumber,
      taxRate: effectiveTaxRate,
      subtotal: subtotalExclusive,
      tax_amount,
      total_amount,
      prices_include_vat: isVatInclusive,
    };
  });

  try {
    const result = createTransaction();
    res.json({
      success: true,
      id: result.transactionId,
      invoice_id: result.invoiceId,
      invoice_number: result.invoiceNumber,
      summary: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
