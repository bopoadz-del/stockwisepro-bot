import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { findWebUserById } from '../db';

const SALT_ROUNDS = 10;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(userId: number): string {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: number };
    return decoded;
  } catch {
    return null;
  }
}

export interface WebAuthRequest extends Express.Request {
  webUser?: { id: number; email: string; name: string | null };
}

export function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const user = findWebUserById(decoded.userId);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  req.webUser = { id: user.id, email: user.email, name: user.name };
  next();
}
