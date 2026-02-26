import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';
import PDFDocument from 'pdfkit';
import XLSX from 'xlsx';

const router = Router();
router.use(authenticate);

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getNumberSetting = (db: ReturnType<typeof getDb>, key: string, fallback: number) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined;
  return toNumber(row?.value, fallback);
};

type PayeBand = { up_to: number | null; rate: number };

const DEFAULT_PAYE_BANDS: PayeBand[] = [
  { up_to: 800_000, rate: 0 },
  { up_to: 3_000_000, rate: 15 },
  { up_to: 12_000_000, rate: 18 },
  { up_to: 25_000_000, rate: 21 },
  { up_to: 50_000_000, rate: 23 },
  { up_to: null, rate: 25 },
];

const getPayeBands = (db: ReturnType<typeof getDb>) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('paye_brackets_json') as { value?: string } | undefined;
  if (!row?.value) return DEFAULT_PAYE_BANDS;

  try {
    const parsed = JSON.parse(row.value) as Array<{ up_to: number | null; rate: number }>;
    const bands = parsed
      .filter((b) => b && (b.up_to === null || Number.isFinite(Number(b.up_to))) && Number.isFinite(Number(b.rate)))
      .map((b) => ({ up_to: b.up_to === null ? null : Number(b.up_to), rate: Number(b.rate) }))
      .sort((a, b) => {
        if (a.up_to === null) return 1;
        if (b.up_to === null) return -1;
        return a.up_to - b.up_to;
      });
    return bands.length ? bands : DEFAULT_PAYE_BANDS;
  } catch {
    return DEFAULT_PAYE_BANDS;
  }
};

const computeAnnualPaye = (annualTaxableIncome: number, bands: PayeBand[]) => {
  let remaining = Math.max(0, annualTaxableIncome);
  let previousCap = 0;
  let tax = 0;

  for (const band of bands) {
    if (remaining <= 0) break;

    if (band.up_to === null) {
      tax += remaining * (band.rate / 100);
      remaining = 0;
      break;
    }

    const bandWidth = Math.max(0, band.up_to - previousCap);
    const taxableInBand = Math.min(remaining, bandWidth);
    tax += taxableInBand * (band.rate / 100);
    remaining -= taxableInBand;
    previousCap = band.up_to;
  }

  return tax;
};

const estimatePayeForPeriod = (periodPayroll: number, periodsPerYear: number, bands: PayeBand[]) => {
  if (!Number.isFinite(periodPayroll) || periodPayroll <= 0 || periodsPerYear <= 0) return 0;
  const annualized = periodPayroll * periodsPerYear;
  const annualTax = computeAnnualPaye(annualized, bands);
  return annualTax / periodsPerYear;
};

const getTaxConfig = (db: ReturnType<typeof getDb>) => {
  const vatRate = toNumber((db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any)?.tax_rate, 7.5);
  const payeRate = getNumberSetting(db, 'paye_rate', 10);
  const payeBands = getPayeBands(db);
  const whtIndividualRate = getNumberSetting(db, 'wht_individual_rate', 5);
  const whtCompanyRate = getNumberSetting(db, 'wht_company_rate', 10);
  const citSmallTurnoverMax = getNumberSetting(db, 'cit_small_turnover_max', 25_000_000);
  const citMediumTurnoverMax = getNumberSetting(db, 'cit_medium_turnover_max', 100_000_000);
  const citSmallRate = getNumberSetting(db, 'cit_small_rate', 0);
  const citMediumRate = getNumberSetting(db, 'cit_medium_rate', 20);
  const citLargeRate = getNumberSetting(db, 'cit_large_rate', 30);
  const reminderDaysBefore = getNumberSetting(db, 'tax_reminder_days_before', 7);
  const monthlyVatDueDay = getNumberSetting(db, 'monthly_vat_due_day', 21);
  const monthlyPayeDueDay = getNumberSetting(db, 'monthly_paye_due_day', 10);
  const monthlyWhtDueDay = getNumberSetting(db, 'monthly_wht_due_day', 21);
  const annualTaxReturnMonth = getNumberSetting(db, 'annual_tax_return_month', 3);
  const annualTaxReturnDay = getNumberSetting(db, 'annual_tax_return_day', 31);
  const citFyEndMonth = getNumberSetting(db, 'cit_fy_end_month', 12);
  const citFyEndDay = getNumberSetting(db, 'cit_fy_end_day', 31);

  return {
    vatRate,
    payeRate,
    payeBands,
    whtIndividualRate,
    whtCompanyRate,
    citSmallTurnoverMax,
    citMediumTurnoverMax,
    citSmallRate,
    citMediumRate,
    citLargeRate,
    reminderDaysBefore,
    monthlyVatDueDay,
    monthlyPayeDueDay,
    monthlyWhtDueDay,
    annualTaxReturnMonth,
    annualTaxReturnDay,
    citFyEndMonth,
    citFyEndDay,
  };
};

const resolveCitRate = (
  annualTurnoverEstimate: number,
  config: ReturnType<typeof getTaxConfig>,
) => {
  if (annualTurnoverEstimate <= config.citSmallTurnoverMax) return config.citSmallRate;
  if (annualTurnoverEstimate <= config.citMediumTurnoverMax) return config.citMediumRate;
  return config.citLargeRate;
};

const createDate = (year: number, month: number, day: number) => new Date(year, month - 1, day, 23, 59, 59, 999);

const addMonths = (date: Date, months: number) => {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
};

const daysUntil = (target: Date) => {
  const now = new Date();
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const formatIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const getNextMonthlyDueDate = (dueDay: number) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  let dueDate = createDate(year, month, dueDay);
  if (dueDate.getTime() < now.getTime()) {
    dueDate = createDate(year, month + 1, dueDay);
  }
  return dueDate;
};

const getNextAnnualDueDate = (month: number, day: number) => {
  const now = new Date();
  let dueDate = createDate(now.getFullYear(), month, day);
  if (dueDate.getTime() < now.getTime()) {
    dueDate = createDate(now.getFullYear() + 1, month, day);
  }
  return dueDate;
};

const getNextCitDueDate = (fyEndMonth: number, fyEndDay: number) => {
  const now = new Date();
  let fyEnd = createDate(now.getFullYear(), fyEndMonth, fyEndDay);
  if (fyEnd.getTime() < now.getTime()) {
    fyEnd = createDate(now.getFullYear() + 1, fyEndMonth, fyEndDay);
  }
  let dueDate = addMonths(fyEnd, 6);
  if (dueDate.getTime() < now.getTime()) {
    fyEnd = createDate(fyEnd.getFullYear() + 1, fyEndMonth, fyEndDay);
    dueDate = addMonths(fyEnd, 6);
  }
  return dueDate;
};

const toReminderLevel = (dueInDays: number, reminderDaysBefore: number) => {
  if (dueInDays < 0) return 'overdue';
  if (dueInDays === 0) return 'due_today';
  if (dueInDays <= reminderDaysBefore) return 'due_soon';
  return 'upcoming';
};

const getComplianceReminders = (db: ReturnType<typeof getDb>) => {
  const config = getTaxConfig(db);
  const reminderDaysBefore = Math.max(1, Number(config.reminderDaysBefore || 7));

  const vatDue = getNextMonthlyDueDate(Number(config.monthlyVatDueDay || 21));
  const payeDue = getNextMonthlyDueDate(Number(config.monthlyPayeDueDay || 10));
  const whtDue = getNextMonthlyDueDate(Number(config.monthlyWhtDueDay || 21));
  const annualReturnDue = getNextAnnualDueDate(Number(config.annualTaxReturnMonth || 3), Number(config.annualTaxReturnDay || 31));
  const citDue = getNextCitDueDate(Number(config.citFyEndMonth || 12), Number(config.citFyEndDay || 31));

  const reminders = [
    { key: 'vat', title: 'VAT Remittance Due', dueDate: vatDue, frequency: 'monthly' },
    { key: 'paye', title: 'PAYE Remittance Due', dueDate: payeDue, frequency: 'monthly' },
    { key: 'wht', title: 'WHT Filing Due', dueDate: whtDue, frequency: 'monthly' },
    { key: 'annual_return', title: 'Annual Tax Return Due', dueDate: annualReturnDue, frequency: 'annual' },
    { key: 'cit', title: 'CIT Filing Due (Est.)', dueDate: citDue, frequency: 'annual' },
  ].map((r) => {
    const dueInDays = daysUntil(r.dueDate);
    return {
      ...r,
      due_date: formatIsoDate(r.dueDate),
      due_in_days: dueInDays,
      level: toReminderLevel(dueInDays, reminderDaysBefore),
    };
  }).sort((a, b) => a.due_in_days - b.due_in_days);

  return {
    reminder_days_before: reminderDaysBefore,
    reminders,
  };
};

const getMonthlyTaxBreakdown = (db: ReturnType<typeof getDb>) => {
  const config = getTaxConfig(db);
  const rows = db.prepare(`
    WITH months AS (
      SELECT strftime('%Y-%m', created_at) as month FROM transactions
      UNION
      SELECT strftime('%Y-%m', date) as month FROM expenses
      UNION
      SELECT strftime('%Y-%m', created_at) as month FROM purchase_orders
    )
    SELECT
      m.month as month,
      COALESCE((
        SELECT SUM(total_amount)
        FROM transactions t
        WHERE strftime('%Y-%m', t.created_at) = m.month
      ), 0) as revenue,
      COALESCE((
        SELECT SUM(amount)
        FROM expenses e
        WHERE strftime('%Y-%m', e.date) = m.month
      ), 0) as expenses,
      COALESCE((
        SELECT SUM(amount)
        FROM expenses e
        WHERE strftime('%Y-%m', e.date) = m.month
          AND lower(e.category) IN ('salary', 'salaries', 'wage', 'wages', 'payroll', 'staff')
      ), 0) as payroll,
      COALESCE((
        SELECT SUM(wht_amount)
        FROM expenses e
        WHERE strftime('%Y-%m', e.date) = m.month
      ), 0) as wht_amount,
      COALESCE((
        SELECT SUM(tax_amount)
        FROM transactions t
        WHERE strftime('%Y-%m', t.created_at) = m.month
      ), 0) as output_vat,
      COALESCE((
        SELECT SUM(input_vat_amount)
        FROM purchase_orders po
        WHERE strftime('%Y-%m', po.created_at) = m.month
          AND po.status != 'cancelled'
          AND po.vat_charged = 1
          AND po.is_claimable_input_vat = 1
      ), 0) as input_vat_claimable
    FROM months m
    WHERE m.month IS NOT NULL
    ORDER BY m.month DESC
  `).all() as any[];

  return rows.map((row) => {
    const revenue = Number(row.revenue || 0);
    const expenses = Number(row.expenses || 0);
    const payroll = Number(row.payroll || 0);
    const whtAmount = Number(row.wht_amount || 0);
    const outputVat = Number(row.output_vat || 0);
    const inputVatClaimable = Number(row.input_vat_claimable || 0);
    const vatPayable = outputVat - inputVatClaimable;
    const annualizedTurnover = revenue * 12;
    const citRate = resolveCitRate(annualizedTurnover, config);
    const taxableProfit = Math.max(revenue - expenses, 0);
    const citEstimate = taxableProfit * (citRate / 100);
    const payeEstimate = estimatePayeForPeriod(payroll, 12, config.payeBands);
    const effectivePayeRate = payroll > 0 ? (payeEstimate / payroll) * 100 : 0;
    const totalTaxEstimate = vatPayable + citEstimate + payeEstimate + whtAmount;

    return {
      month: String(row.month),
      revenue,
      expenses,
      payroll,
      wht_amount: whtAmount,
      vat_rate: config.vatRate,
      output_vat: outputVat,
      input_vat_claimable: inputVatClaimable,
      vat_payable: vatPayable,
      cit_rate: citRate,
      cit_estimate: citEstimate,
      paye_rate: effectivePayeRate,
      paye_estimate: payeEstimate,
      total_tax_estimate: totalTaxEstimate,
    };
  });
};

router.get('/dashboard', (req, res) => {
  const db = getDb();

  const revenueToday = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE date(created_at) = date('now')
  `).get() as any;
  const revenueWeek = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE date(created_at) >= date('now', '-6 days')
  `).get() as any;
  const revenueMonth = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE date(created_at) >= date('now', 'start of month')
  `).get() as any;

  const expensesToday = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date(date) = date('now')
  `).get() as any;
  const expensesMonth = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date(date) >= date('now', 'start of month')
  `).get() as any;

  const taxConfig = getTaxConfig(db);

  const vatTodayRow = db.prepare(`
    SELECT COALESCE(SUM(tax_amount), 0) as total
    FROM transactions
    WHERE date(created_at) = date('now')
  `).get() as any;
  const vatMonthRow = db.prepare(`
    SELECT COALESCE(SUM(tax_amount), 0) as total
    FROM transactions
    WHERE date(created_at) >= date('now', 'start of month')
  `).get() as any;

  const revenueYtd = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE date(created_at) >= date('now', 'start of year')
  `).get() as any;
  const expensesYtd = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date(date) >= date('now', 'start of year')
  `).get() as any;

  const payrollTodayRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date(date) = date('now')
      AND lower(category) IN ('salary', 'salaries', 'wage', 'wages', 'payroll', 'staff')
  `).get() as any;
  const payrollMonthRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date(date) >= date('now', 'start of month')
      AND lower(category) IN ('salary', 'salaries', 'wage', 'wages', 'payroll', 'staff')
  `).get() as any;
  const whtTodayRow = db.prepare(`
    SELECT COALESCE(SUM(wht_amount), 0) as total
    FROM expenses
    WHERE date(date) = date('now')
  `).get() as any;
  const whtMonthRow = db.prepare(`
    SELECT COALESCE(SUM(wht_amount), 0) as total
    FROM expenses
    WHERE date(date) >= date('now', 'start of month')
  `).get() as any;

  const dayOfYearRow = db.prepare(`
    SELECT CAST(strftime('%j', 'now') AS INTEGER) as day_of_year
  `).get() as any;
  const dayOfYear = Math.max(1, Number(dayOfYearRow?.day_of_year || 1));

  const annualTurnoverEstimate = (Number(revenueYtd.total || 0) / dayOfYear) * 365;
  const citRate = resolveCitRate(annualTurnoverEstimate, taxConfig);
  const taxableProfitToday = Math.max(Number(revenueToday.total || 0) - Number(expensesToday.total || 0), 0);
  const taxableProfitMonth = Math.max(Number(revenueMonth.total || 0) - Number(expensesMonth.total || 0), 0);
  const taxableProfitYtd = Math.max(Number(revenueYtd.total || 0) - Number(expensesYtd.total || 0), 0);

  const vatToday = Number(vatTodayRow.total || 0);
  const vatMonth = Number(vatMonthRow.total || 0);
  const payeToday = estimatePayeForPeriod(Number(payrollTodayRow.total || 0), 365, taxConfig.payeBands);
  const payeMonth = estimatePayeForPeriod(Number(payrollMonthRow.total || 0), 12, taxConfig.payeBands);
  const payeEffectiveRate = Number(payrollMonthRow.total || 0) > 0 ? (payeMonth / Number(payrollMonthRow.total || 0)) * 100 : 0;
  const citToday = taxableProfitToday * (citRate / 100);
  const citMonth = taxableProfitMonth * (citRate / 100);
  const citYtd = taxableProfitYtd * (citRate / 100);
  const whtToday = Number(whtTodayRow.total || 0);
  const whtMonth = Number(whtMonthRow.total || 0);

  const transactionsToday = db.prepare(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE date(created_at) = date('now')
  `).get() as any;
  const transactionsTotal = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as any;

  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as any;
  const lowStock = db.prepare(`
    SELECT COUNT(*) as count
    FROM products
    WHERE quantity <= min_threshold AND quantity > 0
  `).get() as any;
  const outOfStock = db.prepare('SELECT COUNT(*) as count FROM products WHERE quantity = 0').get() as any;
  const healthyStock = db.prepare(`
    SELECT COUNT(*) as count
    FROM products
    WHERE quantity > min_threshold
  `).get() as any;

  const finishingSoon = db.prepare(`
    SELECT id, name, sku, quantity, min_threshold
    FROM products
    WHERE quantity <= min_threshold AND quantity > 0
    ORDER BY quantity ASC
    LIMIT 5
  `).all();
  const outOfStockProducts = db.prepare(`
    SELECT id, name, sku, quantity
    FROM products
    WHERE quantity = 0
    ORDER BY name ASC
    LIMIT 5
  `).all();
  const fastMoving = db.prepare(`
    SELECT
      ti.product_id,
      ti.product_name,
      SUM(ti.quantity) as quantity_sold
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE date(t.created_at) >= date('now', '-30 days')
    GROUP BY ti.product_id, ti.product_name
    ORDER BY quantity_sold DESC
    LIMIT 5
  `).all();

  const recentTransactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5').all();

  const stockHealthPct = totalProducts.count > 0
    ? Math.round((healthyStock.count / totalProducts.count) * 100)
    : 0;

  res.json({
    revenue: {
      today: revenueToday.total,
      week: revenueWeek.total,
      month: revenueMonth.total,
    },
    expenses: {
      today: expensesToday.total,
      month: expensesMonth.total,
    },
    vat: {
      rate: taxConfig.vatRate,
      today: vatToday,
      month: vatMonth,
    },
    cit: {
      rate: citRate,
      annual_turnover_estimate: annualTurnoverEstimate,
      taxable_profit_ytd: taxableProfitYtd,
      ytd_estimate: citYtd,
      today_estimate: citToday,
      month_estimate: citMonth,
    },
    paye: {
      rate: payeEffectiveRate,
      payroll_today: Number(payrollTodayRow.total || 0),
      payroll_month: Number(payrollMonthRow.total || 0),
      today_estimate: payeToday,
      month_estimate: payeMonth,
    },
    wht: {
      individual_rate: taxConfig.whtIndividualRate,
      company_rate: taxConfig.whtCompanyRate,
      today: whtToday,
      month: whtMonth,
    },
    profit: {
      today: Number(revenueToday.total || 0) - Number(expensesToday.total || 0) - vatToday - citToday - payeToday - whtToday,
      month: Number(revenueMonth.total || 0) - Number(expensesMonth.total || 0) - vatMonth - citMonth - payeMonth - whtMonth,
    },
    transactions: {
      today: transactionsToday.count,
      total: transactionsTotal.count,
    },
    inventory: {
      total: totalProducts.count,
      lowStock: lowStock.count,
      outOfStock: outOfStock.count,
      stockHealthPct,
    },
    status: {
      finishingSoon,
      outOfStockProducts,
      fastMoving,
    },
    recentTransactions,
    compliance: getComplianceReminders(db),
  });
});

router.get('/sales-chart', (req, res) => {
  const db = getDb();
  // Get last 7 days revenue
  const sales = db.prepare(`
    SELECT date(created_at) as date, SUM(total_amount) as total 
    FROM transactions 
    WHERE created_at >= date('now', '-6 days')
    GROUP BY date(created_at)
    ORDER BY date(created_at)
  `).all();
  res.json(sales);
});

router.get('/attendant-performance', (req, res) => {
  const db = getDb();
  const performance = req.user?.role === 'attendant'
    ? db.prepare(`
        SELECT attendant_name, COUNT(*) as transactions, COALESCE(SUM(total_amount), 0) as revenue
        FROM transactions
        WHERE date(created_at) = date('now') AND attendant_id = ?
        GROUP BY attendant_name
      `).all(req.user.id)
    : db.prepare(`
        SELECT attendant_name, COUNT(*) as transactions, COALESCE(SUM(total_amount), 0) as revenue
        FROM transactions
        WHERE date(created_at) = date('now')
        GROUP BY attendant_name
      `).all();
  res.json(performance);
});

router.get('/settings', (req, res) => {
  const db = getDb();
  const config = getTaxConfig(db);
  res.json({
    tax_rate: config.vatRate,
    vat_rate: config.vatRate,
    paye_rate: config.payeRate,
    paye_brackets_json: JSON.stringify(config.payeBands),
    wht_individual_rate: config.whtIndividualRate,
    wht_company_rate: config.whtCompanyRate,
    cit_small_turnover_max: config.citSmallTurnoverMax,
    cit_medium_turnover_max: config.citMediumTurnoverMax,
    cit_small_rate: config.citSmallRate,
    cit_medium_rate: config.citMediumRate,
    cit_large_rate: config.citLargeRate,
    tax_reminder_days_before: config.reminderDaysBefore,
    monthly_vat_due_day: config.monthlyVatDueDay,
    monthly_paye_due_day: config.monthlyPayeDueDay,
    monthly_wht_due_day: config.monthlyWhtDueDay,
    annual_tax_return_month: config.annualTaxReturnMonth,
    annual_tax_return_day: config.annualTaxReturnDay,
    cit_fy_end_month: config.citFyEndMonth,
    cit_fy_end_day: config.citFyEndDay,
  });
});

router.post('/settings', authorize(['admin']), (req, res) => {
  const {
    tax_rate,
    vat_rate,
    paye_rate,
    paye_brackets_json,
    wht_individual_rate,
    wht_company_rate,
    cit_small_turnover_max,
    cit_medium_turnover_max,
    cit_small_rate,
    cit_medium_rate,
    cit_large_rate,
    tax_reminder_days_before,
    monthly_vat_due_day,
    monthly_paye_due_day,
    monthly_wht_due_day,
    annual_tax_return_month,
    annual_tax_return_day,
    cit_fy_end_month,
    cit_fy_end_day,
  } = req.body || {};
  const db = getDb();
  const requestedVatRate = toNumber(vat_rate ?? tax_rate, 7.5);
  const effectiveVatRate = requestedVatRate > 0 && requestedVatRate <= 15 ? requestedVatRate : 7.5;

  db.prepare(`
    INSERT INTO tax_settings (id, tax_rate, updated_at)
    VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      tax_rate = excluded.tax_rate,
      updated_at = CURRENT_TIMESTAMP
  `).run(effectiveVatRate);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_rate', ?)").run(String(effectiveVatRate));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vat_rate', ?)").run(String(effectiveVatRate));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('paye_rate', ?)").run(String(toNumber(paye_rate, 10)));
  if (typeof paye_brackets_json === 'string' && paye_brackets_json.trim()) {
    try {
      JSON.parse(paye_brackets_json);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('paye_brackets_json', ?)").run(paye_brackets_json.trim());
    } catch {
      // Ignore invalid JSON payload for PAYE bands.
    }
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('wht_individual_rate', ?)").run(String(toNumber(wht_individual_rate, 5)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('wht_company_rate', ?)").run(String(toNumber(wht_company_rate, 10)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cit_small_turnover_max', ?)").run(String(toNumber(cit_small_turnover_max, 25_000_000)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cit_medium_turnover_max', ?)").run(String(toNumber(cit_medium_turnover_max, 100_000_000)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cit_small_rate', ?)").run(String(toNumber(cit_small_rate, 0)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cit_medium_rate', ?)").run(String(toNumber(cit_medium_rate, 20)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cit_large_rate', ?)").run(String(toNumber(cit_large_rate, 30)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_reminder_days_before', ?)").run(String(toNumber(tax_reminder_days_before, 7)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('monthly_vat_due_day', ?)").run(String(toNumber(monthly_vat_due_day, 21)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('monthly_paye_due_day', ?)").run(String(toNumber(monthly_paye_due_day, 10)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('monthly_wht_due_day', ?)").run(String(toNumber(monthly_wht_due_day, 21)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('annual_tax_return_month', ?)").run(String(toNumber(annual_tax_return_month, 3)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('annual_tax_return_day', ?)").run(String(toNumber(annual_tax_return_day, 31)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cit_fy_end_month', ?)").run(String(toNumber(cit_fy_end_month, 12)));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cit_fy_end_day', ?)").run(String(toNumber(cit_fy_end_day, 31)));

  res.json({ success: true });
});

router.get('/compliance-reminders', (req, res) => {
  const db = getDb();
  res.json(getComplianceReminders(db));
});

router.get('/financial-summary', (req, res) => {
  const db = getDb();
  const revenue = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN total_amount END), 0) as today,
      COALESCE(SUM(CASE WHEN date(created_at) >= date('now', 'start of month') THEN total_amount END), 0) as month
    FROM transactions
  `).get() as any;
  const expenses = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(date) = date('now') THEN amount END), 0) as today,
      COALESCE(SUM(CASE WHEN date(date) >= date('now', 'start of month') THEN amount END), 0) as month
    FROM expenses
  `).get() as any;
  const taxConfig = getTaxConfig(db);
  const vat = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN tax_amount END), 0) as today,
      COALESCE(SUM(CASE WHEN date(created_at) >= date('now', 'start of month') THEN tax_amount END), 0) as month,
      COALESCE(SUM(CASE WHEN date(created_at) >= date('now', 'start of year') THEN tax_amount END), 0) as ytd
    FROM transactions
  `).get() as any;

  const payroll = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(date) = date('now') AND lower(category) IN ('salary', 'salaries', 'wage', 'wages', 'payroll', 'staff') THEN amount END), 0) as today,
      COALESCE(SUM(CASE WHEN date(date) >= date('now', 'start of month') AND lower(category) IN ('salary', 'salaries', 'wage', 'wages', 'payroll', 'staff') THEN amount END), 0) as month
    FROM expenses
  `).get() as any;
  const wht = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(date) = date('now') THEN wht_amount END), 0) as today,
      COALESCE(SUM(CASE WHEN date(date) >= date('now', 'start of month') THEN wht_amount END), 0) as month,
      COALESCE(SUM(CASE WHEN date(date) >= date('now', 'start of year') THEN wht_amount END), 0) as ytd
    FROM expenses
  `).get() as any;

  const revenueYtd = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE date(created_at) >= date('now', 'start of year')
  `).get() as any;
  const expensesYtd = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date(date) >= date('now', 'start of year')
  `).get() as any;
  const dayOfYearRow = db.prepare(`SELECT CAST(strftime('%j', 'now') AS INTEGER) as day_of_year`).get() as any;
  const dayOfYear = Math.max(1, Number(dayOfYearRow?.day_of_year || 1));
  const annualTurnoverEstimate = (Number(revenueYtd.total || 0) / dayOfYear) * 365;
  const citRate = resolveCitRate(annualTurnoverEstimate, taxConfig);
  const taxableProfitToday = Math.max(Number(revenue.today || 0) - Number(expenses.today || 0), 0);
  const taxableProfitMonth = Math.max(Number(revenue.month || 0) - Number(expenses.month || 0), 0);
  const taxableProfitYtd = Math.max(Number(revenueYtd.total || 0) - Number(expensesYtd.total || 0), 0);
  const citToday = taxableProfitToday * (citRate / 100);
  const citMonth = taxableProfitMonth * (citRate / 100);
  const citYtd = taxableProfitYtd * (citRate / 100);
  const payeToday = estimatePayeForPeriod(Number(payroll.today || 0), 365, taxConfig.payeBands);
  const payeMonth = estimatePayeForPeriod(Number(payroll.month || 0), 12, taxConfig.payeBands);
  const payeEffectiveRate = Number(payroll.month || 0) > 0 ? (payeMonth / Number(payroll.month || 0)) * 100 : 0;

  res.json({
    revenue,
    expenses,
    vat: { rate: taxConfig.vatRate, today: Number(vat.today || 0), month: Number(vat.month || 0), ytd: Number(vat.ytd || 0) },
    cit: { rate: citRate, today_estimate: citToday, month_estimate: citMonth, ytd_estimate: citYtd, taxable_profit_ytd: taxableProfitYtd, annual_turnover_estimate: annualTurnoverEstimate },
    paye: { rate: payeEffectiveRate, today_estimate: payeToday, month_estimate: payeMonth, payroll_today: Number(payroll.today || 0), payroll_month: Number(payroll.month || 0) },
    wht: { individual_rate: taxConfig.whtIndividualRate, company_rate: taxConfig.whtCompanyRate, today: Number(wht.today || 0), month: Number(wht.month || 0), ytd: Number(wht.ytd || 0) },
    profit: {
      today: Number(revenue.today || 0) - Number(expenses.today || 0) - Number(vat.today || 0) - citToday - payeToday - Number(wht.today || 0),
      month: Number(revenue.month || 0) - Number(expenses.month || 0) - Number(vat.month || 0) - citMonth - payeMonth - Number(wht.month || 0),
    },
  });
});

router.get('/revenue-module', (req, res) => {
  const db = getDb();
  const isAttendant = req.user?.role === 'attendant';
  const userId = req.user?.id || 0;

  const filter = isAttendant ? ' AND t.attendant_id = ?' : '';
  const params = isAttendant ? [userId] : [];

  const daily = db.prepare(`
    SELECT COALESCE(SUM(ti.subtotal), 0) as total
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE date(t.created_at) = date('now')${filter}
  `).get(...params) as any;

  const monthly = db.prepare(`
    SELECT COALESCE(SUM(ti.subtotal), 0) as total
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE date(t.created_at) >= date('now', 'start of month')${filter}
  `).get(...params) as any;

  const perProduct = db.prepare(`
    SELECT
      ti.product_id,
      ti.product_name,
      COALESCE(SUM(ti.quantity), 0) as quantity_sold,
      COALESCE(SUM(ti.subtotal), 0) as revenue
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE date(t.created_at) >= date('now', 'start of month')${filter}
    GROUP BY ti.product_id, ti.product_name
    ORDER BY revenue DESC
    LIMIT 20
  `).all(...params);

  const perAttendant = db.prepare(`
    SELECT
      t.attendant_id,
      t.attendant_name,
      COUNT(DISTINCT CASE WHEN date(t.created_at) = date('now') THEN t.id END) as transactions_today,
      COALESCE(SUM(CASE WHEN date(t.created_at) = date('now') THEN ti.subtotal END), 0) as revenue_today,
      COUNT(DISTINCT t.id) as transactions_month,
      COALESCE(SUM(ti.subtotal), 0) as revenue_month
    FROM transactions t
    LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
    WHERE date(t.created_at) >= date('now', 'start of month')${filter}
    GROUP BY t.attendant_id, t.attendant_name
    ORDER BY revenue_month DESC
  `).all(...params);

  res.json({
    formula: 'Revenue = SellingPrice * QuantitySold',
    daily_revenue: Number(daily?.total || 0),
    monthly_revenue: Number(monthly?.total || 0),
    revenue_per_product: perProduct,
    revenue_per_attendant: perAttendant,
  });
});

router.get('/inventory-report', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.category,
      p.quantity,
      p.min_threshold,
      p.cost_price,
      p.selling_price,
      (p.selling_price - p.cost_price) as profit_per_unit,
      CASE
        WHEN p.quantity = 0 THEN 'out_of_stock'
        WHEN p.quantity <= p.min_threshold THEN 'low_stock'
        ELSE 'healthy'
      END as stock_status
    FROM products p
    ORDER BY p.name
  `).all();
  res.json(rows);
});

router.get('/tax-report', (req, res) => {
  const db = getDb();
  const rows = getMonthlyTaxBreakdown(db);
  res.json(rows);
});

router.get('/vat-position', (req, res) => {
  const db = getDb();
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const outputVat = db.prepare(`
    SELECT COALESCE(SUM(tax_amount), 0) as total
    FROM transactions
    WHERE strftime('%Y-%m', created_at) = ?
  `).get(month) as any;

  const inputVat = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN vat_charged = 1 THEN input_vat_amount END), 0) as total_input,
      COALESCE(SUM(CASE WHEN vat_charged = 1 AND is_claimable_input_vat = 1 THEN input_vat_amount END), 0) as claimable_input
    FROM purchase_orders
    WHERE strftime('%Y-%m', created_at) = ? AND status != 'cancelled'
  `).get(month) as any;

  const netVat = Number(outputVat.total || 0) - Number(inputVat.claimable_input || 0);
  res.json({
    month,
    output_vat: Number(outputVat.total || 0),
    input_vat_total: Number(inputVat.total_input || 0),
    input_vat_claimable: Number(inputVat.claimable_input || 0),
    vat_payable: netVat,
    vat_credit: netVat < 0 ? Math.abs(netVat) : 0,
  });
});

router.get('/profit-report', (req, res) => {
  const db = getDb();
  const taxRate = (db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any)?.tax_rate || 0;
  const byDay = db.prepare(`
    WITH sales AS (
      SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY date(created_at)
    ),
    costs AS (
      SELECT date(date) as day, COALESCE(SUM(amount), 0) as expenses
      FROM expenses
      GROUP BY date(date)
    )
    SELECT
      COALESCE(sales.day, costs.day) as day,
      COALESCE(sales.revenue, 0) as revenue,
      COALESCE(costs.expenses, 0) as expenses
    FROM sales
    LEFT JOIN costs ON costs.day = sales.day
    UNION
    SELECT
      COALESCE(sales.day, costs.day) as day,
      COALESCE(sales.revenue, 0) as revenue,
      COALESCE(costs.expenses, 0) as expenses
    FROM costs
    LEFT JOIN sales ON sales.day = costs.day
    ORDER BY day DESC
    LIMIT 30
  `).all() as any[];
  const rows = byDay.map((row) => {
    const tax = Number(row.revenue) * (Number(taxRate) / 100);
    return {
      ...row,
      tax,
      profit: Number(row.revenue) - Number(row.expenses) - tax,
    };
  });
  res.json(rows.reverse());
});

router.get('/products/profit-analytics', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.cost_price,
      p.selling_price,
      (p.selling_price - p.cost_price) as profit_per_unit,
      COALESCE(SUM(ti.quantity), 0) as qty_sold,
      COALESCE(SUM((ti.unit_price - p.cost_price) * ti.quantity), 0) as realized_profit
    FROM products p
    LEFT JOIN transaction_items ti ON ti.product_id = p.id
    GROUP BY p.id
    ORDER BY realized_profit DESC
  `).all();
  res.json(rows);
});

router.get('/products/not-sold-30-days', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.id, p.name, p.sku, p.quantity, p.category
    FROM products p
    LEFT JOIN transaction_items ti ON ti.product_id = p.id
    LEFT JOIN transactions t ON t.id = ti.transaction_id AND date(t.created_at) >= date('now', '-30 days')
    GROUP BY p.id
    HAVING COUNT(t.id) = 0
    ORDER BY p.name
  `).all();
  res.json(rows);
});

router.get('/credit-sales', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT cs.*, t.invoice_number, t.customer_name
    FROM credit_sales cs
    JOIN transactions t ON t.id = cs.transaction_id
    ORDER BY cs.created_at DESC
  `).all();
  res.json(rows);
});

router.get('/export/csv', (req, res) => {
  const db = getDb();
  const type = String(req.query.type || 'transactions');
  let rows: any[] = [];

  if (type === 'tax') {
    rows = getMonthlyTaxBreakdown(db);
  } else if (type === 'inventory') {
    rows = db.prepare('SELECT name, sku, category, quantity, min_threshold FROM products ORDER BY name').all();
  } else if (type === 'profit') {
    rows = db.prepare(`
      SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY date(created_at)
      ORDER BY day DESC
      LIMIT 30
    `).all();
  } else {
    rows = db.prepare(`
      SELECT invoice_number, customer_name, attendant_name, payment_method, subtotal, tax_amount, total_amount, created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 500
    `).all();
  }

  if (rows.length === 0) return res.status(404).json({ error: 'No data found for export' });

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
  res.send(csv);
});

router.get('/export/excel', (req, res) => {
  const db = getDb();
  const type = String(req.query.type || 'transactions');
  let rows: any[] = [];
  if (type === 'inventory') {
    rows = db.prepare('SELECT name, sku, category, quantity, min_threshold FROM products ORDER BY name').all();
  } else if (type === 'tax') {
    rows = getMonthlyTaxBreakdown(db);
  } else if (type === 'profit') {
    rows = db.prepare(`
      SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY date(created_at)
      ORDER BY day DESC
      LIMIT 30
    `).all();
  } else {
    rows = db.prepare(`
      SELECT invoice_number, customer_name, attendant_name, payment_method, subtotal, tax_amount, total_amount, created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 500
    `).all();
  }
  if (!rows.length) return res.status(404).json({ error: 'No data found for export' });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, type);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.xlsx"`);
  res.send(buf);
});

router.get('/export/pdf', (req, res) => {
  const db = getDb();
  const type = String(req.query.type || 'transactions');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(`Smart POS ${type.toUpperCase()} Report`);
  doc.moveDown();

  if (type === 'inventory') {
    const rows = db.prepare('SELECT name, sku, quantity, min_threshold FROM products ORDER BY name LIMIT 100').all() as any[];
    rows.forEach((r) => doc.fontSize(10).text(`${r.name} (${r.sku}) - Qty: ${r.quantity} / Min: ${r.min_threshold}`));
  } else if (type === 'tax') {
    const rows = getMonthlyTaxBreakdown(db).slice(0, 24);
    rows.forEach((r) => {
      doc.fontSize(10).text(
        `${r.month}  VAT: ${r.vat_payable.toFixed(2)}  CIT Est.: ${r.cit_estimate.toFixed(2)}  PAYE Est.: ${r.paye_estimate.toFixed(2)}  WHT: ${r.wht_amount.toFixed(2)}  Total Est.: ${r.total_tax_estimate.toFixed(2)}`,
      );
    });
  } else if (type === 'profit') {
    const rows = db.prepare(`
      SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY date(created_at)
      ORDER BY day DESC
      LIMIT 30
    `).all() as any[];
    rows.forEach((r) => doc.fontSize(10).text(`${r.day}  Revenue: ${Number(r.revenue).toFixed(2)}`));
  } else {
    const rows = db.prepare(`
      SELECT invoice_number, customer_name, total_amount, created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 100
    `).all() as any[];
    rows.forEach((r) => doc.fontSize(10).text(`${r.invoice_number} | ${r.customer_name} | ${Number(r.total_amount).toFixed(2)} | ${r.created_at}`));
  }

  doc.end();
});

export default router;
