// azureTTS.js - Ultra-Fast Streaming Azure TTS

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;


let currentVoiceGender = 'female';
let persistentSynthesizer = null;
let isSynthesizerBusy = false;
let requestQueue = [];
let isProcessingQueue = false;

// Performance modes
const PERFORMANCE_MODES = {
  FAST: 'fast',      // Minimal SSML, fastest response
  BALANCED: 'balanced', // Some SSML, good balance
  QUALITY: 'quality'  // Full SSML, most natural
};

let currentPerformanceMode = PERFORMANCE_MODES.BALANCED;

/**
 * Get current voice config
 */
export function getCurrentVoiceConfig() {
  return {
    gender: currentVoiceGender,
    name: currentVoiceGender === 'female' ? 'en-US-AvaNeural' : 'en-US-AndrewNeural',
    style: currentVoiceGender === 'female' ? 'warm' : 'friendly',
    performanceMode: currentPerformanceMode,
    description: currentVoiceGender === 'female'
      ? 'Warm, empathetic female therapist with natural intonation'
      : 'Warm, compassionate male therapist with conversational tone'
  };
}

/**
 * Set voice gender
 */
export function setVoiceGender(gender) {
  if (gender === 'male' || gender === 'female') {
    currentVoiceGender = gender;
    // Reset synthesizer to use new voice
    if (persistentSynthesizer) {
      try {
        persistentSynthesizer.close();
      } catch (e) {
        // Ignore
      }
      persistentSynthesizer = null;
    }
  }
}

/**
 * Set performance mode
 */
export function setPerformanceMode(mode) {
  if (Object.values(PERFORMANCE_MODES).includes(mode)) {
    currentPerformanceMode = mode;
  }
}

/**
 * Check if Azure credentials are configured
 */
function checkCredentials() {
  return !!(SPEECH_KEY && SPEECH_REGION);
}

/**
 * Get random conversation starter
 */
export function getRandomConversationStarter() {
  const starters = [
    "Hi there. I'm really glad you reached out today. What's been on your mind?",
    "Hello. It's good to connect with you. How are you feeling right now?",
    "Hi. Thank you for being here. What's bringing you in today?",
    "Hello. I'm here to listen. What would you like to share with me?",
    "Hi there. I appreciate you taking this step. How has your day been treating you?",
    "Hello. It's nice to meet you. What's been weighing on your heart lately?",
    "Hi. I'm glad we're having this conversation. What feels most important to talk about right now?",
    "Hello. Thank you for trusting me with your time. How are you holding up today?"
  ];
  return starters[Math.floor(Math.random() * starters.length)];
}

/**
 * Create or get persistent synthesizer
 */
function getPersistentSynthesizer() {
  if (!persistentSynthesizer) {
    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    const voiceName = currentVoiceGender === 'female' ? 'en-US-AvaNeural' : 'en-US-AndrewNeural';
    speechConfig.speechSynthesisVoiceName = voiceName;
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3;

    persistentSynthesizer = new sdk.SpeechSynthesizer(speechConfig);
  }
  return persistentSynthesizer;
}

/**
 * Generate optimized SSML based on performance mode
 */
function generateOptimizedSSML(text) {
  const voiceName = currentVoiceGender === 'female' ? 'en-US-AvaNeural' : 'en-US-AndrewNeural';

  // Escape XML characters
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  switch (currentPerformanceMode) {
    case PERFORMANCE_MODES.FAST:
      // Minimal SSML - just voice selection, no prosody
      return `<speak version="1.0" xml:lang="en-US"><voice name="${voiceName}">${escapedText}</voice></speak>`;

    case PERFORMANCE_MODES.BALANCED:
      // Basic prosody without complex styling
      const isFemale = currentVoiceGender === 'female';
      return `<speak version="1.0" xml:lang="en-US">
        <voice name="${voiceName}">
          <prosody rate="${isFemale ? '0.95' : '0.9'}" pitch="${isFemale ? '+2%' : '+1%'}" volume="+5%">
            ${escapedText}
          </prosody>
        </voice>
      </speak>`;

    case PERFORMANCE_MODES.QUALITY:
    default:
      // Full SSML with natural speech patterns
      const isFemaleQ = currentVoiceGender === 'female';
      const voiceStyle = isFemaleQ ? 'warm' : 'friendly';

      const processedText = escapedText
        .replace(/\?/, '<break time="200ms"/>?')
        .replace(/\./g, '<break time="150ms"/>.')
        .replace(/,/g, '<break time="100ms"/>,')
        .replace(/!/g, '<break time="150ms"/>!');

      return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
             xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
        <voice name="${voiceName}">
          <mstts:express-as style="${voiceStyle}" styledegree="1.3">
            <prosody rate="${isFemaleQ ? '0.95' : '0.9'}" pitch="${isFemaleQ ? '+3%' : '+2%'}" volume="+8%">
              <break time="50ms"/>
              ${processedText}
              <break time="200ms"/>
            </prosody>
          </mstts:express-as>
        </voice>
      </speak>`;
  }
}

/**
 * Process the next request in queue
 */
function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0 || isSynthesizerBusy) {
    return;
  }

  isProcessingQueue = true;
  const nextRequest = requestQueue.shift();

  if (nextRequest) {
    textToSpeechInternal(nextRequest.text, nextRequest.onAudioChunk, nextRequest.onError, nextRequest.onComplete);
  } else {
    isProcessingQueue = false;
  }
}

/**
 * Add request to queue
 */
function queueRequest(text, onAudioChunk, onError, onComplete) {
  requestQueue.push({ text, onAudioChunk, onError, onComplete });
  processQueue();
}

/**
 * Ultra-fast streaming text-to-speech with proper queuing
 */
export function textToSpeech(text, onAudioChunk, onError, onComplete) {
  if (!text || typeof text !== 'string') {
    if (onError) onError('Invalid text input');
    return { stop: () => {} };
  }

  if (!checkCredentials()) {
    if (onError) onError('Azure credentials not configured');
    return { stop: () => {} };
  }

  // If synthesizer is busy, queue the request
  if (isSynthesizerBusy) {
    return queueRequest(text, onAudioChunk, onError, onComplete);
  }

  // Process immediately if not busy
  return textToSpeechInternal(text, onAudioChunk, onError, onComplete);
}

/**
 * Internal TTS function (called by queue processor)
 */
function textToSpeechInternal(text, onAudioChunk, onError, onComplete) {
  isSynthesizerBusy = true;
  const synthesizer = getPersistentSynthesizer();
  let isInterrupted = false;

  const cleanup = () => {
    isSynthesizerBusy = false;
    if (onComplete) onComplete();
    // Process next item in queue
    setTimeout(() => {
      isProcessingQueue = false;
      processQueue();
    }, 50);
  };

  try {
    const ssml = generateOptimizedSSML(text);

    synthesizer.speakSsmlAsync(
      ssml,
      result => {
        if (!isInterrupted && result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          if (result.audioData && result.audioData.byteLength > 0 && onAudioChunk) {
            const base64Audio = Buffer.from(result.audioData).toString('base64');
            onAudioChunk(base64Audio);
          }
        } else if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
          if (onError) onError(`Speech synthesis failed: ${result.reason}`);
        }
        cleanup();
      },
      error => {
        if (onError) onError(`TTS Error: ${error}`);
        cleanup();
      }
    );

    return {
      stop: () => {
        if (!isInterrupted) {
          isInterrupted = true;
          try {
            synthesizer.stopSpeakingAsync();
          } catch (e) {
          }
          cleanup();
        }
      }
    };

  } catch (err) {
    if (onError) onError(`Exception: ${err.message}`);
    cleanup();
    return { stop: () => {} };
  }
}

/**
 * Force cleanup of persistent synthesizer and clear queue
 */
export function cleanupSynthesizer() {
  if (persistentSynthesizer) {
    try {
      persistentSynthesizer.close();
    } catch (e) {
      // Ignore
    }
    persistentSynthesizer = null;
  }
  isSynthesizerBusy = false;
  requestQueue = [];
  isProcessingQueue = false;
}

/**
 * Get queue status
 */
export function getQueueStatus() {
  return {
    queueLength: requestQueue.length,
    isBusy: isSynthesizerBusy,
    isProcessing: isProcessingQueue
  };
}