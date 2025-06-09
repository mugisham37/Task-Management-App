import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import { i18nMiddleware, initI18n } from './config/i18n';
import { errorHandler, notFound } from './middleware/error.middleware';
import { stream as morganStream } from './config/logger';
import config from './config/environment';
import { setupSwagger } from './config/swagger';

// Create Express app
const app: Express = express();

// Initialize i18n
initI18n();

// Set security HTTP headers
app.use(helmet());

// Enable CORS
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);

// Parse JSON request body
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded request body
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize request data
app.use(mongoSanitize());

// Compress response bodies
app.use(compression());

// Request logging
app.use(
  morgan('combined', {
    stream: morganStream,
    skip: (req) => req.url === '/health',
  }),
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later',
  }),
);

// i18n middleware
app.use(i18nMiddleware);

// Setup Swagger documentation
setupSwagger(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  });
});

// API routes
import routes from './routes';
app.use('/api/v1', routes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

export default app;
