import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const dbPath = path.resolve('smart_pos.db');
const db = new Database(dbPath);

export function getDb() {
  return db;
}

export function initializeDatabase() {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Roles
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    );
  `);

  const seedRole = db.prepare(`
    INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)
  `);
  seedRole.run('admin', 'Full control including users, settings, and reports');
  seedRole.run('manager', 'Manage products and view reports');
  seedRole.run('attendant', 'Process sales and view own sales');

  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'attendant')),
      role_id INTEGER,
      branch_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Branches (multi-branch support)
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.prepare(`
    INSERT OR IGNORE INTO branches (name, code, address, is_active)
    VALUES ('Main Branch', 'MAIN', 'Default branch', 1)
  `).run();

  // Products
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT UNIQUE,
      category TEXT NOT NULL,
      cost_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      safe_price REAL,
      standard_price REAL,
      premium_price REAL,
      quantity INTEGER NOT NULL DEFAULT 0,
      initial_stock INTEGER NOT NULL DEFAULT 0,
      min_threshold INTEGER NOT NULL DEFAULT 5,
      branch_id INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Transactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE,
      customer_name TEXT,
      subtotal REAL NOT NULL,
      tax_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      attendant_id INTEGER NOT NULL,
      attendant_name TEXT NOT NULL,
      customer_id INTEGER,
      branch_id INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (attendant_id) REFERENCES users(id)
    );
  `);

  // Invoices
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      transaction_id INTEGER UNIQUE NOT NULL,
      customer_name TEXT,
      attendant_id INTEGER NOT NULL,
      attendant_name TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (attendant_id) REFERENCES users(id)
    );
  `);

  // Transaction Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Multi-invoice draft carts (open invoices before checkout)
  db.exec(`
    CREATE TABLE IF NOT EXISTS draft_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_code TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      status TEXT NOT NULL CHECK(status IN ('open', 'paid', 'cancelled')) DEFAULT 'open',
      transaction_id INTEGER,
      invoice_id INTEGER,
      attendant_id INTEGER NOT NULL,
      attendant_name TEXT NOT NULL,
      branch_id INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (attendant_id) REFERENCES users(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS draft_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (draft_invoice_id) REFERENCES draft_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Expenses
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      date DATETIME NOT NULL,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurring_interval TEXT,
      vendor TEXT,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      reference_no TEXT,
      payee_type TEXT NOT NULL DEFAULT 'none',
      wht_applicable INTEGER NOT NULL DEFAULT 0,
      wht_rate REAL NOT NULL DEFAULT 0,
      wht_amount REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL DEFAULT 0,
      created_by INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tax Settings (legacy key-value kept for compatibility)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tax_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tax_rate REAL NOT NULL DEFAULT 7.5,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Stock Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('sale', 'restock', 'adjustment')),
      quantity_before INTEGER NOT NULL,
      quantity_changed INTEGER NOT NULL,
      quantity_after INTEGER NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Raw materials / ingredients
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      min_threshold REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS product_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL,
      quantity_required REAL NOT NULL,
      UNIQUE(product_id, material_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS material_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('sale_usage', 'restock', 'adjustment', 'spoilage')),
      quantity_before REAL NOT NULL,
      quantity_changed REAL NOT NULL,
      quantity_after REAL NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id)
    );
  `);

  // Asset management
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      purchase_cost REAL NOT NULL DEFAULT 0,
      purchase_date DATETIME,
      condition TEXT NOT NULL DEFAULT 'good',
      maintenance_interval_days INTEGER,
      expected_lifespan_months INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      maintenance_date DATETIME NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );
  `);

  // Spoilage tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS spoilage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL CHECK(item_type IN ('product', 'material')),
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      reason TEXT,
      estimated_loss REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Customers
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Suppliers
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      contact_person TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Purchase orders
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT UNIQUE NOT NULL,
      supplier_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('pending', 'received', 'cancelled')) DEFAULT 'pending',
      total_cost REAL NOT NULL DEFAULT 0,
      total_cost_inc_vat REAL NOT NULL DEFAULT 0,
      vat_charged INTEGER NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 7.5,
      input_vat_amount REAL NOT NULL DEFAULT 0,
      supplier_vat_invoice_no TEXT,
      supplier_tin TEXT,
      is_claimable_input_vat INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Credit sales tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER UNIQUE NOT NULL,
      customer_id INTEGER,
      total_amount REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('unpaid', 'partial', 'paid')) DEFAULT 'unpaid',
      due_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  const hasColumn = (table: string, column: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((col) => col.name === column);
  };

  // Lightweight migrations for existing databases
  if (!hasColumn('products', 'initial_stock')) {
    db.exec('ALTER TABLE products ADD COLUMN initial_stock INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE products SET initial_stock = quantity WHERE initial_stock = 0');
  }
  if (!hasColumn('expenses', 'is_recurring')) {
    db.exec('ALTER TABLE expenses ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn('expenses', 'recurring_interval')) {
    db.exec('ALTER TABLE expenses ADD COLUMN recurring_interval TEXT');
  }
  if (!hasColumn('expenses', 'vendor')) {
    db.exec('ALTER TABLE expenses ADD COLUMN vendor TEXT');
  }
  if (!hasColumn('expenses', 'payment_method')) {
    db.exec("ALTER TABLE expenses ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'");
  }
  if (!hasColumn('expenses', 'reference_no')) {
    db.exec('ALTER TABLE expenses ADD COLUMN reference_no TEXT');
  }
  if (!hasColumn('expenses', 'created_by')) {
    db.exec('ALTER TABLE expenses ADD COLUMN created_by INTEGER');
  }
  if (!hasColumn('expenses', 'updated_at')) {
    // SQLite ALTER TABLE does not allow non-constant defaults like CURRENT_TIMESTAMP.
    db.exec('ALTER TABLE expenses ADD COLUMN updated_at DATETIME');
    db.exec("UPDATE expenses SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL");
  }
  if (!hasColumn('expenses', 'payee_type')) {
    db.exec("ALTER TABLE expenses ADD COLUMN payee_type TEXT NOT NULL DEFAULT 'none'");
  }
  if (!hasColumn('expenses', 'wht_applicable')) {
    db.exec('ALTER TABLE expenses ADD COLUMN wht_applicable INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn('expenses', 'wht_rate')) {
    db.exec('ALTER TABLE expenses ADD COLUMN wht_rate REAL NOT NULL DEFAULT 0');
  }
  if (!hasColumn('expenses', 'wht_amount')) {
    db.exec('ALTER TABLE expenses ADD COLUMN wht_amount REAL NOT NULL DEFAULT 0');
  }
  if (!hasColumn('expenses', 'net_amount')) {
    db.exec('ALTER TABLE expenses ADD COLUMN net_amount REAL NOT NULL DEFAULT 0');
    db.exec('UPDATE expenses SET net_amount = amount WHERE net_amount = 0');
  }
  if (!hasColumn('transactions', 'invoice_number')) {
    db.exec('ALTER TABLE transactions ADD COLUMN invoice_number TEXT');
  }
  if (!hasColumn('users', 'role_id')) {
    db.exec('ALTER TABLE users ADD COLUMN role_id INTEGER');
  }
  if (!hasColumn('users', 'branch_id')) {
    db.exec('ALTER TABLE users ADD COLUMN branch_id INTEGER');
  }
  if (!hasColumn('products', 'barcode')) {
    db.exec('ALTER TABLE products ADD COLUMN barcode TEXT');
  }
  if (!hasColumn('products', 'branch_id')) {
    db.exec('ALTER TABLE products ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1');
  }
  if (!hasColumn('products', 'safe_price')) {
    db.exec('ALTER TABLE products ADD COLUMN safe_price REAL');
    db.exec('UPDATE products SET safe_price = cost_price WHERE safe_price IS NULL');
  }
  if (!hasColumn('products', 'standard_price')) {
    db.exec('ALTER TABLE products ADD COLUMN standard_price REAL');
    db.exec('UPDATE products SET standard_price = selling_price WHERE standard_price IS NULL');
  }
  if (!hasColumn('products', 'premium_price')) {
    db.exec('ALTER TABLE products ADD COLUMN premium_price REAL');
    db.exec('UPDATE products SET premium_price = selling_price * 1.2 WHERE premium_price IS NULL');
  }
  if (!hasColumn('transactions', 'customer_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN customer_id INTEGER');
  }
  if (!hasColumn('transactions', 'branch_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1');
  }
  if (!hasColumn('purchase_orders', 'total_cost_inc_vat')) {
    db.exec('ALTER TABLE purchase_orders ADD COLUMN total_cost_inc_vat REAL NOT NULL DEFAULT 0');
    db.exec('UPDATE purchase_orders SET total_cost_inc_vat = total_cost WHERE total_cost_inc_vat = 0');
  }
  if (!hasColumn('purchase_orders', 'vat_charged')) {
    db.exec('ALTER TABLE purchase_orders ADD COLUMN vat_charged INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn('purchase_orders', 'vat_rate')) {
    db.exec('ALTER TABLE purchase_orders ADD COLUMN vat_rate REAL NOT NULL DEFAULT 7.5');
  }
  if (!hasColumn('purchase_orders', 'input_vat_amount')) {
    db.exec('ALTER TABLE purchase_orders ADD COLUMN input_vat_amount REAL NOT NULL DEFAULT 0');
  }
  if (!hasColumn('purchase_orders', 'supplier_vat_invoice_no')) {
    db.exec('ALTER TABLE purchase_orders ADD COLUMN supplier_vat_invoice_no TEXT');
  }
  if (!hasColumn('purchase_orders', 'supplier_tin')) {
    db.exec('ALTER TABLE purchase_orders ADD COLUMN supplier_tin TEXT');
  }
  if (!hasColumn('purchase_orders', 'is_claimable_input_vat')) {
    db.exec('ALTER TABLE purchase_orders ADD COLUMN is_claimable_input_vat INTEGER NOT NULL DEFAULT 1');
  }
  if (!hasColumn('draft_invoices', 'transaction_id')) {
    db.exec('ALTER TABLE draft_invoices ADD COLUMN transaction_id INTEGER');
  }
  if (!hasColumn('draft_invoices', 'invoice_id')) {
    db.exec('ALTER TABLE draft_invoices ADD COLUMN invoice_id INTEGER');
  }

  // Seed Tax Rate if not exists
  const taxCheck = db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get();
  if (!taxCheck) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('tax_rate', '7.5')").run();
  }
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('vat_rate', '7.5')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('paye_rate', '10')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('paye_brackets_json', '[{\"up_to\":800000,\"rate\":0},{\"up_to\":3000000,\"rate\":15},{\"up_to\":12000000,\"rate\":18},{\"up_to\":25000000,\"rate\":21},{\"up_to\":50000000,\"rate\":23},{\"up_to\":null,\"rate\":25}]')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('wht_individual_rate', '5')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('wht_company_rate', '10')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cit_small_turnover_max', '25000000')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cit_medium_turnover_max', '100000000')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cit_small_rate', '0')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cit_medium_rate', '20')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cit_large_rate', '30')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_reminder_days_before', '7')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_vat_due_day', '21')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_paye_due_day', '10')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_wht_due_day', '21')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('annual_tax_return_month', '3')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('annual_tax_return_day', '31')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cit_fy_end_month', '12')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cit_fy_end_day', '31')").run();

  // Nigeria-first default migration for legacy installs that still use 10%
  if (taxCheck && String((taxCheck as any).value) === '10') {
    db.prepare("UPDATE settings SET value = '7.5' WHERE key = 'tax_rate'").run();
  }

  // Guardrail: in Nigeria-first mode, VAT should not keep legacy CIT-like rates (e.g. 20/30)
  const vatRow = db.prepare("SELECT value FROM settings WHERE key = 'vat_rate'").get() as any;
  const legacyVat = vatRow ? Number(vatRow.value) : NaN;
  if (!Number.isFinite(legacyVat) || legacyVat <= 0 || legacyVat > 15) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vat_rate', '7.5')").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_rate', '7.5')").run();
    db.prepare(`
      INSERT INTO tax_settings (id, tax_rate, updated_at)
      VALUES (1, 7.5, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET tax_rate = 7.5, updated_at = CURRENT_TIMESTAMP
    `).run();
  }

  const effectiveTax = db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get() as any;
  db.prepare(`
    INSERT OR IGNORE INTO tax_settings (id, tax_rate, updated_at)
    VALUES (1, ?, CURRENT_TIMESTAMP)
  `).run(effectiveTax ? parseFloat(effectiveTax.value) : 7.5);

  db.prepare(`
    UPDATE tax_settings
    SET tax_rate = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1 AND tax_rate = 10
  `).run(effectiveTax ? parseFloat(effectiveTax.value) : 7.5);

  // Seed Admin User if not exists
  const adminCheck = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (!adminCheck) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, full_name, role)
      VALUES ('admin', ?, 'System Admin', 'admin')
    `).run(hashedPassword);
    console.log('Seeded admin user: admin / admin123');
  }
  
  // Seed some initial products if empty
  const productCheck = db.prepare("SELECT id FROM products LIMIT 1").get();
  if (!productCheck) {
    const insertProduct = db.prepare(`
      INSERT INTO products (name, sku, barcode, category, cost_price, selling_price, quantity, initial_stock, min_threshold, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    
    insertProduct.run('Wireless Mouse', 'WM-001', '123456700001', 'Electronics', 15.00, 29.99, 50, 50, 10);
    insertProduct.run('Mechanical Keyboard', 'MK-002', '123456700002', 'Electronics', 45.00, 89.99, 20, 20, 5);
    insertProduct.run('USB-C Cable', 'CB-003', '123456700003', 'Accessories', 2.00, 9.99, 100, 100, 20);
    insertProduct.run('Monitor 24"', 'MN-004', '123456700004', 'Electronics', 120.00, 199.99, 8, 8, 3);
    insertProduct.run('Office Chair', 'OC-005', '123456700005', 'Furniture', 80.00, 150.00, 4, 4, 5);
    
    console.log('Seeded initial products');
  }

  // Backfill role_id for users where possible
  db.exec(`
    UPDATE users
    SET role_id = (SELECT id FROM roles WHERE roles.name = users.role)
    WHERE role_id IS NULL
  `);
  db.exec(`
    UPDATE users
    SET branch_id = 1
    WHERE branch_id IS NULL
  `);
}
