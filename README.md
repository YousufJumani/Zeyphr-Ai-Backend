# Zeyphr Backend - AI Voice Therapist API

The Node.js backend for Zeyphr, providing AI-powered therapy sessions with real-time voice processing and Socket.IO communication.

## ✨ Features

- **🧠 AI Therapy Engine** - GPT-4o-mini powered conversations via OpenRouter
- **🎤 Neural Text-to-Speech** - High-quality voice synthesis via Azure Cognitive Services
- **🔄 Real-time Communication** - Socket.IO for instant voice streaming
- **⚡ Performance Optimization** - Smart queuing system for TTS requests
- **🔒 Security First** - CORS protection and input validation
- **📊 Health Monitoring** - Server status and metrics endpoints
- **🎯 Voice Management** - Dynamic voice switching and performance modes

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or later)
- Azure Speech Services account
- OpenRouter API account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/zeyphr-backend.git
   cd zeyphr-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Start the server**
   ```bash
   npm start
   ```

The server will start on `http://localhost:3001`

## 🏗️ Project Structure

```
backend/
├── server.js                 # Main Express server with Socket.IO
├── services/
│   ├── openrouter-clean.js   # OpenRouter AI integration
│   └── azureTTS-clean.js     # Azure Text-to-Speech service
├── package.json
├── .env.example             # Environment variables template
└── README.md
```

## 🔧 Configuration

### Environment Variables (.env)

```env
# Azure Speech Services
AZURE_SPEECH_KEY=your_azure_speech_key_here
AZURE_SPEECH_REGION=eastus

# OpenRouter AI
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS (Production)
FRONTEND_URL=http://localhost:3000
```

## 🎯 API Endpoints

### Health Check
```http
GET /health
```
Returns server status and connection metrics.

### Voice Management
```http
POST /api/voice/switch
```
Switch between male/female therapist voices.

```http
POST /api/voice/performance
```
Change TTS performance mode (fast/balanced/quality).

```http
GET /api/voice/current
```
Get current voice configuration.

## 🔌 Socket.IO Events

### Client → Server
- `start-session` - Initialize therapy session
- `speech` - Send user speech for processing
- `interrupt-ai` - Pause current AI response
- `end-session` - Terminate therapy session

### Server → Client
- `ai-response` - AI therapist's text response
- `ai-audio` - Audio data for TTS playback
- `ready-to-listen` - Ready for next user input
- `error` - Error notifications

## 🧠 AI Integration

### Dr. Ava - The AI Therapist
- **Personality**: Warm, empathetic, conversational
- **Style**: Natural speech patterns, therapeutic techniques
- **Memory**: Maintains conversation context
- **Approach**: Client-centered, non-diagnostic, self-discovery focused

### OpenRouter Configuration
- **Model**: GPT-4o-mini for optimal balance of intelligence and speed
- **Temperature**: 0.8 for creative yet consistent responses
- **Max Tokens**: 120 for concise, therapeutic responses
- **Context Window**: Last 10 messages for conversation continuity

## 🎤 Text-to-Speech Engine

### Azure Cognitive Services
- **Voices**: Ava (Female) and Andrew (Male) neural voices
- **Quality Modes**:
  - **Fast**: Minimal processing, quickest response
  - **Balanced**: Standard quality with good performance
  - **Quality**: Enhanced prosody and natural intonation

### Performance Features
- **Smart Queuing**: Prevents audio conflicts during rapid interactions
- **Streaming**: Real-time audio generation and transmission
- **Interruption Support**: Immediate response cancellation
- **Error Recovery**: Graceful fallback handling

## 🔒 Security Features

- **CORS Protection** - Configurable origin restrictions
- **Input Validation** - Message length and content sanitization
- **Rate Limiting** - API abuse prevention
- **Environment Security** - Secure credential management
- **HTTPS Ready** - Production SSL/TLS support

## 📊 Monitoring & Health

### Health Endpoint Response
```json
{
  "status": "healthy",
  "uptime": "2h 30m",
  "connections": 5,
  "memory": "45MB",
  "api_status": {
    "openrouter": "connected",
    "azure_tts": "connected"
  }
}
```

## 🚀 Production Deployment

### Recommended Platforms
- **Railway** - Easy Node.js deployment with built-in databases
- **Render** - Free tier with automatic SSL
- **Heroku** - Traditional PaaS with add-ons
- **DigitalOcean App Platform** - Scalable container deployment

### Environment Setup
```bash
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com
PORT=3001
```

### SSL Configuration
The server automatically handles HTTPS when deployed to platforms with SSL termination.

## 🐛 Troubleshooting

### API Connection Issues
- ✅ Verify API keys in `.env` file
- ✅ Check network connectivity
- ✅ Monitor API rate limits and quotas

### Socket.IO Problems
- ✅ Check CORS configuration
- ✅ Verify frontend URL settings
- ✅ Monitor connection logs

### TTS Issues
- ✅ Validate Azure credentials
- ✅ Check region settings
- ✅ Verify voice availability

### Performance Problems
- ✅ Monitor memory usage
- ✅ Check concurrent connection limits
- ✅ Optimize Socket.IO configuration

## 🔧 Development

### Available Scripts

```bash
npm start      # Start production server
npm run dev    # Start with nodemon for development
npm run check  # Display environment variables
```

### Testing API Keys

```bash
npm run check
```

This displays all configured environment variables for verification.

## 📈 Scaling Considerations

- **Horizontal Scaling**: Multiple server instances behind load balancer
- **Redis Adapter**: For Socket.IO clustering
- **Database Integration**: For conversation persistence
- **Rate Limiting**: Advanced API protection
- **Monitoring**: Application performance tracking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is part of the Zeyphr AI Therapist application. See the main repository for license information.

---

**Built with ❤️ for scalable mental health technology**
