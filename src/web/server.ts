import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import apiRouter from './api';

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
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api', apiRouter);

  // Static files — serve built React SPA
  app.use(express.static(WEB_DIST));

  // SPA fallback: all non-API routes → index.html
  app.use((_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });

  return app;
}
