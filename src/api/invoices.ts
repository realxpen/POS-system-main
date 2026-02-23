import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate } from './middleware/auth';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

const router = Router();
router.use(authenticate);

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

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(18).text('Smart POS Invoice', { align: 'left' });
  doc.moveDown();
  doc.fontSize(10).text(`Invoice: ${invoice.invoice_number}`);
  doc.text(`Date: ${new Date(invoice.issued_at).toLocaleString()}`);
  doc.text(`Customer: ${invoice.customer_name || 'Walk-in Customer'}`);
  doc.text(`Attendant: ${invoice.attendant_name}`);
  doc.text(`Payment Method: ${invoice.payment_method}`);
  doc.moveDown();

  doc.fontSize(11).text('Items', { underline: true });
  doc.moveDown(0.5);
  items.forEach((item) => {
    doc.fontSize(10).text(
      `${item.product_name}  x${item.quantity}  @ ${item.unit_price.toFixed(2)}  = ${item.subtotal.toFixed(2)}`,
    );
  });
  doc.moveDown();
  doc.text(`Subtotal: ${invoice.subtotal.toFixed(2)}`);
  doc.text(`Tax: ${invoice.tax_amount.toFixed(2)}`);
  doc.fontSize(12).text(`Total: ${invoice.total_amount.toFixed(2)}`, { underline: true });
  doc.end();
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
        <h3>Invoice ${invoice.invoice_number}</h3>
        <p>Customer: ${invoice.customer_name || 'Walk-in Customer'}</p>
        <p>Date: ${new Date(invoice.issued_at).toLocaleString()}</p>
        <p>Total: ${Number(invoice.total_amount).toFixed(2)}</p>
      `,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
