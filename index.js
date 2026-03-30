require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');
const setupLiveStats = require('./services/liveStats');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// Middleware
const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowAllOrigins = allowedOrigins.length === 0;
const corsOrigin = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowAllOrigins || allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('CORS blocked for this origin'));
};

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/memories', require('./routes/memories'));
app.use('/api/events', require('./routes/events'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/members', require('./routes/members'));
app.use('/api/images', require('./routes/images'));

// Base routes
const shouldServeClient = process.env.SERVE_CLIENT === 'true' || process.env.NODE_ENV === 'production';
const clientDistPath = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.resolve(__dirname, '../client/dist');

if (!shouldServeClient) {
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Batch Memory backend is running',
      api: '/api',
      health: '/api/health',
    });
  });
}

app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Batch Memory API root',
    health: '/api/health',
    routes: ['/api/memories', '/api/events', '/api/posts', '/api/members', '/api/images'],
  });
});

// Health check
app.get('/api/health', (req, res) => res.json({ success: true, message: '🎓 Batch Memory API is running!' }));

if (shouldServeClient && fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 404 handler
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

setupLiveStats(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
