import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 5000;

// Warn about missing email config on startup
const requiredEnvVars = ['JWT_SECRET'];
const optionalButImportant = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'CLIENT_URL'];

// In production, enforce additional security-critical env vars
if (process.env.NODE_ENV === 'production') {
  requiredEnvVars.push('PII_ENCRYPTION_KEY', 'JWT_REFRESH_SECRET');
}

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

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email service: ${process.env.SMTP_USER ? '✅ Configured' : '❌ NOT configured — emails disabled'}`);
});

// ── Graceful Shutdown ────────────────────────────────────────────
// On SIGTERM (Render deploy) or SIGINT (Ctrl+C), stop accepting new
// connections, drain in-flight requests, disconnect the DB pool, then exit.
const shutdown = async (signal: string) => {
  console.log(`\n⏳ Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      const prisma = (await import('./config/db')).default;
      await prisma.$disconnect();
      console.log('✅ Database disconnected. Goodbye.');
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
    }
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
