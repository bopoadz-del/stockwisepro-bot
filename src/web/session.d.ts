import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId: number;
    webUser: { id: number; email: string; name: string | null };
  }
}
