import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { initializeDatabase } from './src/db/init';
import authRoutes from './src/api/auth';
import productRoutes from './src/api/products';
import transactionRoutes from './src/api/transactions';
import expenseRoutes from './src/api/expenses';
import reportRoutes from './src/api/reports';
import userRoutes from './src/api/users';
import invoiceRoutes from './src/api/invoices';
import customerRoutes from './src/api/customers';
import supplierRoutes from './src/api/suppliers';
import branchRoutes from './src/api/branches';
import purchaseOrderRoutes from './src/api/purchaseOrders';
import creditSaleRoutes from './src/api/creditSales';
import draftInvoiceRoutes from './src/api/draftInvoices';
import materialRoutes from './src/api/materials';
import assetRoutes from './src/api/assets';
import spoilageRoutes from './src/api/spoilage';
import costingRoutes from './src/api/costing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Initialize Database
  try {
    initializeDatabase();
    console.log('Database initialized');
  } catch (err) {
    console.error('Database init error:', err);
  }

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/branches', branchRoutes);
  app.use('/api/purchase-orders', purchaseOrderRoutes);
  app.use('/api/credit-sales', creditSaleRoutes);
  app.use('/api/draft-invoices', draftInvoiceRoutes);
  app.use('/api/materials', materialRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/spoilage', spoilageRoutes);
  app.use('/api/costing', costingRoutes);

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Vite middleware for development
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
