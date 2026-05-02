import jwt from 'jsonwebtoken';
import { Response } from 'express';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';

// ═══════════════════════════════════════════════════════════════════
//  Secret Accessors
// ═══════════════════════════════════════════════════════════════════

const getAccessSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('FATAL: JWT_SECRET is not defined.');
  return secret;
};

const getRefreshSecret = (): string => {
  // Falls back to JWT_SECRET + suffix if JWT_REFRESH_SECRET not set
  const secret = process.env.JWT_REFRESH_SECRET || `${getAccessSecret()}_refresh`;
  return secret;
};

// ═══════════════════════════════════════════════════════════════════
//  Token Generation
// ═══════════════════════════════════════════════════════════════════

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: '15m' });
};

export const generateRefreshToken = (payload: RefreshTokenPayload): string => {
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: '7d' });
};

// ═══════════════════════════════════════════════════════════════════
//  Token Verification
// ═══════════════════════════════════════════════════════════════════

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, getAccessSecret()) as AccessTokenPayload;
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  return jwt.verify(token, getRefreshSecret()) as RefreshTokenPayload;
};

// ═══════════════════════════════════════════════════════════════════
//  Cookie Helpers
// ═══════════════════════════════════════════════════════════════════

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string
): void => {
  // Access token cookie — short-lived (15 minutes)
  const production = isProduction();
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: true, // Always true for Render/HTTPS
    sameSite: 'none', // Required for cross-site on Render
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  // Refresh token cookie — long-lived (7 days)
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
};

export {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getAccessSecret,
  getRefreshSecret,
};
