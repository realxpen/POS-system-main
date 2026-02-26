import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate } from './middleware/auth';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import fs from 'fs';

const router = Router();
router.use(authenticate);

const THEME = {
  teal: '#47c8c5',
  dark: '#2f3440',
  lightGray: '#f2f4f7',
  text: '#1f2937',
  muted: '#6b7280',
};

const formatMoney = (value: number) => {
  const amount = Number(value || 0);
  return `\u20A6${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const resolveInvoiceFont = () => {
  const candidates = [
    'C:\\Windows\\Fonts\\seguisym.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\arialuni.ttf',
    'C:\\Windows\\Fonts\\calibri.ttf',
  ];
  return candidates.find((p) => fs.existsSync(p));
};

const INVOICE_FONT_PATH = resolveInvoiceFont();

const applyInvoiceFont = (doc: PDFKit.PDFDocument) => {
  if (INVOICE_FONT_PATH) doc.font(INVOICE_FONT_PATH);
  else doc.font('Helvetica');
};

function drawInvoiceHeader(doc: PDFKit.PDFDocument, title: string) {
  const pageWidth = doc.page.width;
  doc.save();

  doc.rect(40, 38, pageWidth - 80, 64).fill('#ffffff');
  doc.rect(40, 56, 18, 18).fill(THEME.teal);
  doc.fillColor('#111111').fontSize(38).text(title, 70, 44, { characterSpacing: 1.2 });

  const brandX = pageWidth - 290;
  doc.rect(brandX, 56, 250, 44).fill(THEME.teal);
  doc.fillColor('#ffffff').fontSize(19).text('SMART POS', brandX + 14, 67);
  doc.fillColor('#dff7f6').fontSize(9).text('Inventory + Accounting Suite', brandX + 14, 87);

  doc.restore();
}

function drawInvoiceTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const startX = 58;
  const fullWidth = doc.page.width - 116;

  doc.save();
  doc.rect(startX, y, fullWidth, 26).fill(THEME.dark);
  doc.fillColor('#ffffff').fontSize(11);
  doc.text('ITEM DESCRIPTION', startX + 10, y + 8);
  doc.text('QTY', startX + 260, y + 8, { width: 54, align: 'center' });
  doc.text('PRICE', startX + 318, y + 8, { width: 92, align: 'center' });
  doc.text('TOTAL', startX + 414, y + 8, { width: 92, align: 'center' });
  doc.restore();
}

function renderInvoicePdf(
  doc: PDFKit.PDFDocument,
  invoice: any,
  items: Array<{ product_name: string; quantity: number; unit_price: number; subtotal: number }>,
) {
  applyInvoiceFont(doc);
  drawInvoiceHeader(doc, 'INVOICE');

  doc.fillColor(THEME.muted).fontSize(11).text('Invoice to:', 60, 126);
  doc.fillColor(THEME.text).fontSize(13).text(invoice.customer_name || 'Walk-in Customer', 60, 145);
  doc.fillColor(THEME.muted).fontSize(10).text('Customer Address / Contact', 60, 162);

  doc.fillColor(THEME.text).fontSize(14).text(`Invoice # ${invoice.invoice_number}`, 360, 142);
  doc.fontSize(12).text(`Date ${new Date(invoice.issued_at).toLocaleDateString()}`, 360, 164);
  doc.fontSize(11).fillColor(THEME.muted).text(`Attendant: ${invoice.attendant_name}`, 360, 184);

  let y = 224;
  drawInvoiceTableHeader(doc, y);
  y += 26;

  const rowHeight = 30;
  const startX = 58;
  const fullWidth = doc.page.width - 116;

  items.forEach((item, index) => {
    if (y > 678) {
      doc.addPage();
      applyInvoiceFont(doc);
      drawInvoiceHeader(doc, 'INVOICE');
      y = 116;
      drawInvoiceTableHeader(doc, y);
      y += 26;
    }

    if (index % 2 === 1) {
      doc.rect(startX, y, fullWidth, rowHeight).fill(THEME.lightGray);
    }

    doc.fillColor(THEME.text).fontSize(10);
    doc.text(item.product_name, startX + 10, y + 9, { width: 246, ellipsis: true });
    doc.text(String(item.quantity), startX + 260, y + 9, { width: 54, align: 'center' });
    doc.text(formatMoney(Number(item.unit_price)), startX + 318, y + 9, { width: 92, align: 'center' });
    doc.text(formatMoney(Number(item.subtotal)), startX + 414, y + 9, { width: 92, align: 'center' });

    y += rowHeight;
  });

  const summaryY = y + 16;
  doc.fillColor(THEME.text).fontSize(11);
  doc.text('TOTAL (VAT INCLUDED)', 360, summaryY + 8, { width: 210, align: 'right' });
  doc.fillColor(THEME.muted).fontSize(9).text('VAT is included in item prices.', 360, summaryY + 28, { width: 210, align: 'right' });

  const bandY = summaryY + 52;
  doc.rect(58, bandY, 252, 34).fill(THEME.teal);
  doc.fillColor('#ffffff').fontSize(12).text('PAYMENT METHOD', 76, bandY + 10);
  doc.rect(346, bandY, 222, 34).fill(THEME.teal);
  doc.fillColor('#ffffff').fontSize(12).text('GRAND TOTAL', 364, bandY + 10);
  doc.fontSize(13).text(formatMoney(Number(invoice.total_amount)), 466, bandY + 9, { width: 88, align: 'right' });

  doc.fillColor(THEME.text).fontSize(11).text(String(invoice.payment_method || 'N/A'), 76, bandY + 46);

  const footerY = doc.page.height - 66;
  doc.rect(40, footerY, doc.page.width - 80, 36).fill(THEME.dark);
  doc.fillColor('#ffffff').fontSize(8).text('TERMS: Payment due on receipt. Goods sold are subject to business policy.', 58, footerY + 12);
  doc.fontSize(8).text('Smart POS - Lagos, Nigeria', 390, footerY + 12, { width: 160, align: 'right' });
}

function createInvoicePdfBuffer(
  invoice: any,
  items: Array<{ product_name: string; quantity: number; unit_price: number; subtotal: number }>,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    renderInvoicePdf(doc, invoice, items);
    doc.end();
  });
}

router.get('/', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const invoices = user.role === 'attendant'
    ? db.prepare(`
        SELECT * FROM invoices
        WHERE attendant_id = ?
        ORDER BY issued_at DESC
        LIMIT 100
      `).all(user.id)
    : db.prepare('SELECT * FROM invoices ORDER BY issued_at DESC LIMIT 100').all();

  res.json(invoices);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (user.role === 'attendant' && invoice.attendant_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const items = db.prepare(`
    SELECT ti.product_id, ti.product_name, ti.quantity, ti.unit_price, ti.subtotal
    FROM transaction_items ti
    WHERE ti.transaction_id = ?
  `).all(invoice.transaction_id);

  return res.json({ ...invoice, items });
});

router.get('/:id/pdf', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (user.role === 'attendant' && invoice.attendant_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const items = db.prepare(`
    SELECT ti.product_name, ti.quantity, ti.unit_price, ti.subtotal
    FROM transaction_items ti
    WHERE ti.transaction_id = ?
  `).all(invoice.transaction_id) as any[];

  const forceDownload = String(req.query.download || '').trim() === '1';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${forceDownload ? 'attachment' : 'inline'}; filename="${invoice.invoice_number}.pdf"`,
  );

  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  doc.pipe(res);
  renderInvoicePdf(doc, invoice, items);
  doc.end();
});

router.get('/:id/print', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (user.role === 'attendant' && invoice.attendant_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const items = db.prepare(`
    SELECT ti.product_name, ti.quantity, ti.unit_price, ti.subtotal
    FROM transaction_items ti
    WHERE ti.transaction_id = ?
  `).all(invoice.transaction_id) as any[];

  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(String(item.product_name || ''))}</td>
      <td style="text-align:center;">${Number(item.quantity || 0)}</td>
      <td class="money" style="text-align:right;">${escapeHtml(formatMoney(Number(item.unit_price || 0)))}</td>
      <td class="money" style="text-align:right;">${escapeHtml(formatMoney(Number(item.subtotal || 0)))}</td>
    </tr>
  `).join('');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice ${escapeHtml(String(invoice.invoice_number || ''))}</title>
        <style>
          body { font-family: 'Segoe UI', 'Segoe UI Symbol', 'Noto Sans', Arial, sans-serif; margin: 24px; color:#111827; }
          .top { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:18px; }
          .title { font-size:46px; letter-spacing:1px; font-weight:300; margin:0; }
          .brand { background:#47c8c5; color:#fff; padding:14px 18px; min-width:250px; }
          .meta { display:flex; justify-content:space-between; margin-bottom:18px; }
          table { width:100%; border-collapse:collapse; margin-top:12px; }
          th { background:#2f3440; color:#fff; font-weight:600; padding:10px; text-align:left; }
          td { border-bottom:1px solid #e5e7eb; padding:10px; }
          .summary { margin-top:12px; display:flex; justify-content:flex-end; font-size:13px; color:#4b5563; }
          .band { margin-top:20px; display:flex; justify-content:space-between; gap:16px; }
          .band div { background:#47c8c5; color:#fff; padding:10px 16px; font-weight:600; flex:1; }
          .total { text-align:right; }
          .money { font-family: 'Segoe UI Symbol', 'Segoe UI', 'Noto Sans', Arial, sans-serif; white-space: nowrap; }
          @media print { @page { size: A4; margin: 12mm; } }
        </style>
      </head>
      <body>
        <div class="top">
          <h1 class="title">INVOICE</h1>
          <div class="brand"><div style="font-size:30px;font-weight:700;">SMART POS</div><div>Inventory + Accounting Suite</div></div>
        </div>
        <div class="meta">
          <div>
            <div style="color:#6b7280;">Invoice to:</div>
            <div style="font-size:22px;">${escapeHtml(String(invoice.customer_name || 'Walk-in Customer'))}</div>
          </div>
          <div>
            <div><b>Invoice #</b> ${escapeHtml(String(invoice.invoice_number || ''))}</div>
            <div><b>Date</b> ${new Date(invoice.issued_at).toLocaleDateString()}</div>
            <div><b>Attendant</b> ${escapeHtml(String(invoice.attendant_name || ''))}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>ITEM DESCRIPTION</th><th style="text-align:center;">QTY</th><th style="text-align:right;">PRICE</th><th style="text-align:right;">TOTAL</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="summary">Prices include VAT.</div>
        <div class="band">
          <div>PAYMENT METHOD: ${escapeHtml(String(invoice.payment_method || 'N/A'))}</div>
          <div class="total money">GRAND TOTAL: ${escapeHtml(formatMoney(Number(invoice.total_amount || 0)))}</div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
});

router.post('/:id/email', async (req, res) => {
  const db = getDb();
  const user = req.user!;
  const { to } = req.body;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (user.role === 'attendant' && invoice.attendant_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const recipient = String(to || '').trim();
  if (!recipient) return res.status(400).json({ error: 'Recipient email is required' });

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || smtpUser;
  if (!host || !smtpUser || !smtpPass || !from) {
    return res.status(400).json({
      error: 'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.',
    });
  }

  try {
    const items = db.prepare(`
      SELECT ti.product_name, ti.quantity, ti.unit_price, ti.subtotal
      FROM transaction_items ti
      WHERE ti.transaction_id = ?
    `).all(invoice.transaction_id) as any[];
    const pdfBuffer = await createInvoicePdfBuffer(invoice, items);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from,
      to: recipient,
      subject: `Invoice ${invoice.invoice_number}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827;">
          <h3 style="margin-bottom: 8px;">Invoice ${invoice.invoice_number}</h3>
          <p style="margin: 0 0 4px;">Customer: ${invoice.customer_name || 'Walk-in Customer'}</p>
          <p style="margin: 0 0 4px;">Date: ${new Date(invoice.issued_at).toLocaleString()}</p>
          <p style="margin: 0 0 12px;">Total: ${formatMoney(Number(invoice.total_amount))}</p>
          <p style="margin: 0;">A styled PDF invoice is attached.</p>
        </div>
      `,
      attachments: [
        {
          filename: `${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

