import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { redis } from '../services/cache';
import apiRouter from './api';
import whatsappRouter from './whatsapp';

const WEB_DIST = '/app/web-dist';

export function createWebServer() {
  const app = express();

  // Security headers (CSP disabled for SPA)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS
  const corsOrigins = config.webCorsOrigins.length > 0
    ? config.webCorsOrigins
    : ['http://localhost:5173', 'http://localhost:3000'];
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
  }));

  // Session store (Redis if available, memory fallback for dev)
  const sessionStore = redis
    ? new RedisStore({ client: redis, prefix: 'sess:' })
    : undefined;

  app.use(session({
    store: sessionStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'stockwise.sid',
    cookie: {
      secure: config.nodeEnv === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    },
  }));

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging in dev
  if (config.nodeEnv === 'development') {
    app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), whatsapp: 'enabled' });
  });

  // API routes
  app.use('/api', apiRouter);

  // WhatsApp Twilio webhook
  app.use('/api/whatsapp', whatsappRouter);

  // Static files — serve built React SPA
  app.use(express.static(WEB_DIST));

  // SPA fallback: all non-API routes → index.html
  app.use((_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });

  return app;
}
