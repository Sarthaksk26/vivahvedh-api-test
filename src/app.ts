import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
const app = express();

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow serving uploads to other origins
}));
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Prevent large JSON payload DoS

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', globalLimiter);

// Path import fix for uploads
// import path from 'path'; // moved to top

// Rate Limiting for Auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: { error: 'Too many authentication attempts. Please try again later.' }
});
app.use('/api/auth', authLimiter);

// Publicly expose the 'uploads' folder mapping from the exact filepath
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/stories', storyRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'API is running optimally.' });
});

export default app;
