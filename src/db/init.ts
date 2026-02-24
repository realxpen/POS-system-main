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
  if (!hasColumn('transactions', 'customer_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN customer_id INTEGER');
  }
  if (!hasColumn('transactions', 'branch_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN branch_id INTEGER NOT NULL DEFAULT 1');
  }

  // Seed Tax Rate if not exists
  const taxCheck = db.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get();
  if (!taxCheck) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('tax_rate', '7.5')").run();
  }

  // Nigeria-first default migration for legacy installs that still use 10%
  if (taxCheck && String((taxCheck as any).value) === '10') {
    db.prepare("UPDATE settings SET value = '7.5' WHERE key = 'tax_rate'").run();
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
