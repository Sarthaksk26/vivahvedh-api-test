import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import searchRoutes from './routes/search.routes';
import adminRoutes from './routes/admin.routes';
import connectionRoutes from './routes/connection.routes';
import publicRoutes from './routes/public.routes';
import paymentRoutes from './routes/payment.routes';
import storyRoutes from './routes/story.routes';
import { errorHandler } from './middleware/error.middleware';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// 1. Trust proxy for Render/Cloudflare deployment (MUST be first)
app.set('trust proxy', 1);

// 2. Global Security & CORS (MUST be before any routes)
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser clients and same-origin requests with no Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Required for HttpOnly cookie transmission
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// 3. Basic Health Checks (Publicly accessible)
app.get('/', (req, res) => res.status(200).send('Vivahvedh API is live.'));
app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

// 4. Rate Limiting — Global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// 4b. Rate Limiting — Isolated Auth Limiters (Directive 4: Security Hardening)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many refresh attempts.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 5. Static Files
const UPLOADS_PATH = path.join(process.cwd(), 'uploads');
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(UPLOADS_PATH));

app.use('/api/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(UPLOADS_PATH));

// 6. API Routes — Auth routes get isolated rate limiters
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/refresh', refreshLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/stories', storyRoutes);

// 7. 404 Handler (Catch-all)
app.use((req, res) => {
  console.log(`404 at: ${req.originalUrl}`);
  res.status(404).json({ error: `Path ${req.originalUrl} not found.` });
});

// 8. Central Error Handler (MUST be last — 4-argument signature)
app.use(errorHandler);

export default app;
