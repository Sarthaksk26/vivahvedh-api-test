import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import searchRoutes from './routes/search.routes';
import adminRoutes from './routes/admin.routes';
import connectionRoutes from './routes/connection.routes';
import publicRoutes from './routes/public.routes';

const app = express();

import path from 'path';

// Middleware
app.use(cors());
app.use(express.json());

// Publicly expose the 'uploads' folder mapping from the exact filepath
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/connections', connectionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'API is running optimally.' });
});

export default app;
