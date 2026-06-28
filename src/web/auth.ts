import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const SALT_ROUNDS = 10;

// Shared secret for the Telegram→web auto-login link (bot + web run in one process).
const LINK_SECRET = config.jwtSecret || config.sessionSecret;

export interface TelegramLinkPayload {
  tid: number;
  email?: string | null;
  name?: string | null;
}

export function signTelegramLinkToken(payload: TelegramLinkPayload): string {
  return jwt.sign(payload, LINK_SECRET, { expiresIn: '7d' });
}

export function verifyTelegramLinkToken(token: string): TelegramLinkPayload | null {
  try {
    const decoded = jwt.verify(token, LINK_SECRET) as Record<string, unknown>;
    if (typeof decoded.tid !== 'number') return null;
    return {
      tid: decoded.tid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      name: typeof decoded.name === 'string' ? decoded.name : null,
    };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface WebAuthRequest extends Request {
  webUser?: { id: number; email: string; name: string | null };
}

export function authMiddleware(req: WebAuthRequest, res: Response, next: NextFunction) {
  const session = (req as any).session;
  if (!session || !session.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.webUser = session.webUser;
  next();
}
