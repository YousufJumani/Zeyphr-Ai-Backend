import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory for proper path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import services with absolute paths
// Dynamically import service modules with safe fallbacks so the app won't crash
// if a service file is missing (prevents 'Module not found' runtime errors).
let getTherapistResponse = async () => {
  return "I'm here to listen, but the AI service is temporarily unavailable.";
};

let textToSpeech = (text, onChunk, onError, onComplete) => {
  // Minimal fallback synthesizer that immediately calls onComplete
  setTimeout(() => onComplete && onComplete(), 0);
  return { stop: () => {} };
};
let setVoiceGender = () => {};
let getCurrentVoiceConfig = () => ({ gender: 'neutral', performance: 'balanced' });
let getRandomConversationStarter = () => 'Hello, I\'m here to listen.';
let setPerformanceMode = () => {};
let cleanupSynthesizer = () => {};

try {
  const openrouter = await import('./services/openrouter-clean.js');
  if (openrouter && typeof openrouter.getTherapistResponse === 'function') {
    getTherapistResponse = openrouter.getTherapistResponse;
  }
} catch (err) {
  console.error('Optional module ./services/openrouter-clean.js not found or failed to load. Using fallback.');
}

try {
  const azure = await import('./services/azureTTS-clean.js');
  if (azure) {
    if (typeof azure.textToSpeech === 'function') textToSpeech = azure.textToSpeech;
    if (typeof azure.setVoiceGender === 'function') setVoiceGender = azure.setVoiceGender;
    if (typeof azure.getCurrentVoiceConfig === 'function') getCurrentVoiceConfig = azure.getCurrentVoiceConfig;
    if (typeof azure.getRandomConversationStarter === 'function') getRandomConversationStarter = azure.getRandomConversationStarter;
    if (typeof azure.setPerformanceMode === 'function') setPerformanceMode = azure.setPerformanceMode;
    if (typeof azure.cleanupSynthesizer === 'function') cleanupSynthesizer = azure.cleanupSynthesizer;
  }
} catch (err) {
  console.error('Optional module ./services/azureTTS-clean.js not found or failed to load. Using fallback.');
}

dotenv.config();

// Production logging optimization
const isProduction = process.env.NODE_ENV === 'production';
const log = (message, ...args) => {
  if (!isProduction || process.env.DEBUG === 'true') {
    console.log(message, ...args);
  }
};

log('🚀 Starting AI Therapist Server...');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL || false 
      : ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ['GET', 'POST'],
    allowedHeaders: ['*'],
    credentials: false
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['polling', 'websocket']
});

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || false 
    : ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: false
}));

// Request timeout middleware (30 seconds for DigitalOcean App Platform)
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session storage
const sessions = new Map();

// Active TTS synthesizers for interruption
const activeSynthesizers = new Map();

// Greeting message
// Dynamic greeting messages - now using randomized conversation starters
// const GREETING_MESSAGE = "Hello, I'm your AI therapist. I'm here to listen and support you. Please tell me what's on your mind today."; // OLD static message

io.on('connection', (socket) => {
  log(`Client connected: ${socket.id}`);
  sessions.set(socket.id, {
    conversationHistory: [],
    isActive: false
  });

  // Step 1: Button pressed -> Play greeting via Azure TTS and start recording
  socket.on('startSession', async () => {
    log(`Starting session for ${socket.id}`);
    let session = sessions.get(socket.id);
    if (!session) {
      // Create a new session if missing (handles restart after endSession)
      session = {
        conversationHistory: [],
        isActive: false
      };
      sessions.set(socket.id, session);
    }

    session.isActive = true;

    try {
      // Send personalized greeting with randomized conversation starter
      const greetingMessage = getRandomConversationStarter();
      socket.emit('aiResponse', { text: greetingMessage });

      // Convert greeting to Azure TTS voice
      const synthesizer = textToSpeech(
        greetingMessage,
        (audioChunk) => {
          socket.emit('aiAudio', { audio: audioChunk });
        },
        (error) => {
          log(`TTS Error:`, error);
          socket.emit('error', { message: 'Voice synthesis failed: ' + error });
        },
        () => {
          // Clean up when synthesis completes
          activeSynthesizers.delete(socket.id);

          // Notify frontend that recording can start AFTER TTS completes
          socket.emit('readyToListen');
        }
      );

      activeSynthesizers.set(socket.id, synthesizer);

    } catch (error) {
      log(`Error in startSession:`, error);
      socket.emit('error', { message: 'Failed to start session: ' + error.message });
    }
  });
  // Step 2-4: Voice transcribed -> Send to OpenRouter -> Convert response to Azure TTS
  socket.on('userSpeech', async ({ text }) => {
    log(`User speech: "${text?.substring(0, 100)}..."`);
    const session = sessions.get(socket.id);
    if (!session || !text || typeof text !== 'string' || text.trim().length === 0 || text.length > 1000) {
      log('Invalid session or text input');
      return;
    }

    const cleanText = text.trim();
    if (cleanText.length < 2) {
      log('Text too short');
      return;
    }

    // Stop any current TTS
    const currentSynthesizer = activeSynthesizers.get(socket.id);
    if (currentSynthesizer) {
      try {
        currentSynthesizer.stop();
      } catch (err) {
        log('Error stopping TTS:', err.message);
        activeSynthesizers.delete(socket.id);
      }
    }

    try {
      // Add user message to conversation history (keep last 6 exchanges, limit message length)
      session.conversationHistory.push({ 
        role: 'user', 
        content: cleanText.substring(0, 500) // Limit message length
      });
      if (session.conversationHistory.length > 12) {
        session.conversationHistory = session.conversationHistory.slice(-12);
      }

      // Get AI response from OpenRouter
      const aiResponse = await getTherapistResponse(cleanText.substring(0, 500), session.conversationHistory);

      if (!aiResponse) {
        throw new Error('No response from AI service');
      }

      // Send AI response text to frontend
      socket.emit('aiResponse', { text: aiResponse });

      // Add AI response to conversation history
      session.conversationHistory.push({ role: 'assistant', content: aiResponse });

      // Convert AI response to Azure TTS voice
      const synthesizer = textToSpeech(
        aiResponse,
        (audioChunk) => {
          socket.emit('aiAudio', { audio: audioChunk });
        },
        (error) => {
          log('TTS Error for AI response:', error);
          socket.emit('error', { message: 'Voice synthesis failed: ' + error });
        },
        () => {
          // Clean up when synthesis completes
          activeSynthesizers.delete(socket.id);
        }
      );

      activeSynthesizers.set(socket.id, synthesizer);

    } catch (error) {
      log('Error processing user speech:', error);

      // Send fallback response
      const fallbackResponse = "I'm having trouble processing that. Could you please try again?";
      socket.emit('aiResponse', { text: fallbackResponse });

      // Convert fallback to TTS
      const synthesizer = textToSpeech(
        fallbackResponse,
        (audioChunk) => {
          socket.emit('aiAudio', { audio: audioChunk });
        },
        (error) => {
          log('TTS Error for fallback:', error);
        },
        () => {
          // Clean up when synthesis completes
          activeSynthesizers.delete(socket.id);
        }
      );

      activeSynthesizers.set(socket.id, synthesizer);
    }
  });

  // Handle interruption
  socket.on('interruptAI', () => {
    log(`Interrupting AI for ${socket.id}`);
    const synthesizer = activeSynthesizers.get(socket.id);
    if (synthesizer) {
      try {
        synthesizer.stop();
      } catch (err) {
        log('Error stopping TTS during interrupt:', err.message);
      } finally {
        activeSynthesizers.delete(socket.id);
      }
    }
  });

  // Handle speech detection start - auto-interrupt TTS
  socket.on('speechDetected', () => {
    const synthesizer = activeSynthesizers.get(socket.id);
    if (synthesizer) {
      try {
        synthesizer.stop();
      } catch (err) {
        log('Error stopping TTS during speech detection:', err.message);
      } finally {
        activeSynthesizers.delete(socket.id);
      }
    }
  });

  // Handle explicit session end
  socket.on('endSession', () => {
    // Stop any ongoing TTS
    const synthesizer = activeSynthesizers.get(socket.id);
    if (synthesizer) {
      try {
        synthesizer.stop();
      } catch (err) {
        log('Error stopping TTS during session end:', err.message);
      } finally {
        activeSynthesizers.delete(socket.id);
      }
    }

    // Clean up synthesizer resources
    cleanupSynthesizer();

    // Clear session data
    sessions.delete(socket.id);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    // Clean up
    const synthesizer = activeSynthesizers.get(socket.id);
    if (synthesizer) {
      try {
        synthesizer.stop();
      } catch (err) {
        log('Error stopping TTS during disconnect:', err.message);
      } finally {
        activeSynthesizers.delete(socket.id);
      }
    }

    // Clean up synthesizer resources
    cleanupSynthesizer();

    sessions.delete(socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });
  res.status(200).json({
    status: 'ok',
    message: 'AI Therapist Server is running',
    timestamp: new Date().toISOString(),
    socketConnections: sessions.size,
    version: '1.0.0'
  });
});

// Simple rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = requestCounts.get(ip) || [];

  // Remove old requests outside the window
  const validRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (validRequests.length >= RATE_LIMIT_MAX) {
    return false;
  }

  validRequests.push(now);
  requestCounts.set(ip, validRequests);
  return true;
}

// Voice switching endpoint
app.post('/api/voice/switch', express.json(), (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a moment.'
    });
  }

  try {
    const { gender, performanceMode } = req.body;

    if (gender && (gender !== 'male' && gender !== 'female')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid gender. Must be "male" or "female"'
      });
    }

    if (performanceMode && !['fast', 'balanced', 'quality'].includes(performanceMode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid performance mode. Must be "fast", "balanced", or "quality"'
      });
    }

    if (gender) {
      setVoiceGender(gender);
    }

    if (performanceMode) {
      setPerformanceMode(performanceMode);
    }

    const currentConfig = getCurrentVoiceConfig();

    res.json({
      success: true,
      message: `Voice switched to ${gender || 'current'} with ${performanceMode || 'current'} performance mode`,
      voiceConfig: currentConfig
    });
  } catch (error) {
    log('Error switching voice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Performance mode switching endpoint
app.post('/api/voice/performance', express.json(), (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a moment.'
    });
  }

  try {
    const { mode } = req.body;

    if (!mode || !['fast', 'balanced', 'quality'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid performance mode. Must be "fast", "balanced", or "quality"'
      });
    }

    setPerformanceMode(mode);
    const currentConfig = getCurrentVoiceConfig();

    res.json({
      success: true,
      message: `Performance mode switched to ${mode}`,
      voiceConfig: currentConfig
    });
  } catch (error) {
    log('Error switching performance mode:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});// Get current voice configuration
app.get('/api/voice/current', (req, res) => {
  try {
    const currentConfig = getCurrentVoiceConfig();
    res.json({
      success: true,
      voiceConfig: currentConfig
    });
  } catch (error) {
    log('Error getting voice config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Environment check
const checkEnvironment = () => {
  const required = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'OPENROUTER_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    console.error('Please check your .env file');
    if (isProduction) {
      process.exit(1); // Exit in production if required env vars are missing
    }
  } else {
    log('All environment variables are set');
  }
};

// Graceful shutdown handling for DigitalOcean App Platform
const gracefulShutdown = (signal) => {
  log(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    log('HTTP server closed');

    // Clean up all active synthesizers
    for (const [socketId, synthesizer] of activeSynthesizers) {
      try {
        synthesizer.stop();
      } catch (err) {
        log(`Error stopping synthesizer for ${socketId}:`, err.message);
      }
    }
    activeSynthesizers.clear();

    // Clean up synthesizer resources
    cleanupSynthesizer();

    log('Graceful shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    log('Forcing shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (isProduction) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (isProduction) {
    process.exit(1);
  }
});

// Start server (use DO provided PORT, default to 8080)
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  log(`Server running on port ${PORT}`);
  log(`Health check: http://localhost:${PORT}/health`);
  checkEnvironment();
});
