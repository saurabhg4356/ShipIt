const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Trust reverse proxy (Nginx) for correct IP rate-limiting & protocol detection
app.set('trust proxy', 1);

// Security Headers
app.use(helmet());

// CORS configuration
app.use(cors());

// Request body size limit
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// HTTP Request Logging
if (!config.isTest) {
  app.use(
    morgan(config.isProduction ? 'combined' : 'dev', {
      skip: (req) => req.url === '/health', // Keep health checks out of noisy logs
    })
  );
}

// Health check endpoint
app.use('/health', healthRoutes);

// Unmatched routes 404 handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;
