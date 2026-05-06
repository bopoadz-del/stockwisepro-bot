import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';

const SALT_ROUNDS = 10;

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
