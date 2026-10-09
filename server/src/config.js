import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set (32+ characters) in production.');
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/certtracker',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  cookieSecure: isProd && process.env.COOKIE_SECURE !== 'false',
  // Starting password given to people created by import or by an admin.
  // They are forced to change it on first sign-in.
  defaultPassword: process.env.DEFAULT_PASSWORD || 'Welcome@123',
  adminEmpId: process.env.ADMIN_EMP_ID || '',
  adminName: process.env.ADMIN_NAME || 'Administrator',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  expiringDays: Number(process.env.EXPIRING_DAYS) || 90,
};
