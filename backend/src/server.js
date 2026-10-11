import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables before any other imports
dotenv.config();

import { isSupabaseConfigured } from './config/supabase.js';
import tripsRouter from './routes/trips.js';
import contactsRouter from './routes/contacts.js';
import checkinsRouter from './routes/checkins.js';
import profileRouter from './routes/profile.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallback load backend/.env if running from repository root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ==========================================
// ==========================================
// CORS Configuration
// ==========================================
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5000', 'http://127.0.0.1:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, curl, same-origin)
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      Boolean(process.env.VERCEL) ||
      NODE_ENV === 'development'
    ) {
      return callback(null, true);
    }
    const msg = `CORS policy violation: The origin '${origin}' is not allowed.`;
    return callback(new Error(msg), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
}

// ==========================================
// Static Assets (Frontend)
// ==========================================
// Serving frontend directly enables seamless standalone testing
const frontendPath = fs.existsSync(path.resolve(__dirname, '../../public'))
  ? path.resolve(__dirname, '../../public')
  : path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// ==========================================
// API Index & Health Check Endpoints
// ==========================================
app.get('/api', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'WaySafe REST API',
    environment: NODE_ENV,
    deployedOn: process.env.VERCEL ? 'Vercel Serverless' : 'Node.js Express',
    endpoints: [
      '/api/health',
      '/api/trips',
      '/api/contacts',
      '/api/checkins',
      '/api/profile'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'WaySafe REST API',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    serverless: Boolean(process.env.VERCEL),
    database: {
      provider: 'supabase',
      connected: isSupabaseConfigured,
      url: process.env.SUPABASE_URL || 'not-configured',
      note: isSupabaseConfigured
        ? 'Connected to Supabase project.'
        : 'Running in offline/demo mode.'
    }
  });
});

// ==========================================
// REST API Routes
// ==========================================
app.use('/api/trips', tripsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/checkins', checkinsRouter);
app.use('/api/profile', profileRouter);

// ==========================================
// Error Handling
// ==========================================
app.use('/api/*', notFoundHandler);
app.use(errorHandler);

// ==========================================
// Start Server (Only in Standalone Mode)
// ==========================================
let server = null;
if (!process.env.VERCEL) {
  server = app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`🛡️  WaySafe API Server running on port ${PORT}`);
    console.log(`📡  Environment: ${NODE_ENV}`);
    console.log(`🩺  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🌐  Frontend:     http://localhost:${PORT}/index.html`);
    console.log(`⚡  Database:     Supabase (${isSupabaseConfigured ? 'CONNECTED' : 'STANDBY / DEMO'})`);
    console.log('====================================================');
  });
}

// Graceful termination
function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down WaySafe server gracefully...`);
  if (server) {
    server.close(() => {
      console.log('WaySafe server closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
