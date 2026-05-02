import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 5000;

// Warn about missing email config on startup
const requiredEnvVars = ['JWT_SECRET'];
const optionalButImportant = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'CLIENT_URL', 'JWT_REFRESH_SECRET'];

requiredEnvVars.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ FATAL: Missing required env var: ${key}`);
    process.exit(1);
  }
});

optionalButImportant.forEach(key => {
  if (!process.env[key]) {
    console.warn(`⚠️  WARNING: ${key} not set — related features will be disabled`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email service: ${process.env.SMTP_USER ? '✅ Configured' : '❌ NOT configured — emails disabled'}`);
});
