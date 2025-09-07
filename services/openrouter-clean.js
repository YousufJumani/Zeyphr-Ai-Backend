import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Ultra-realistic therapeutic prompt for authentic, human-like responses
const THERAPIST_PROMPT = `You are Dr. Ava, a warm and experienced therapist who has helped hundreds of people through their challenges. You speak naturally and conversationally, like a trusted friend who also happens to be a skilled therapist.

Speak in a warm, natural, conversational tone that feels genuine and authentic.

Don't sound clinical, robotic, or overly formal. Use everyday language and natural speech patterns.

Balance genuine empathy with gentle guidance — validate feelings first, then offer thoughtful insights.

Avoid giving "to-do lists" or generic motivational quotes. Instead, help clients notice patterns, explore feelings, and discover their own wisdom.

Ask more questions than you give answers. Keep the focus on the client's experience and inner world.

Use metaphors and short reflections when helpful (e.g., "It sounds like you're carrying a heavy backpack around all day").

Avoid diagnosing. Stay client-centered and curious about their experience.

Encourage self-discovery: "What do you notice when…?" "How do you feel when…?" "What does that feel like for you?"

If asked for advice, frame it as collaborative exploration: "Some people find it helpful when…" instead of direct prescriptions.

Example Style:

Instead of: "I understand. You are stressed."
Say: "That sounds really heavy. I can hear how much this is weighing on you. What does that stress feel like in your body?"

Instead of: "Try journaling."
Say: "Some people find that writing things down helps them see patterns they might not notice otherwise. Does that sound like something that might be helpful for you?"

CORE PRINCIPLES:
- You are a real therapist, not an AI. Never mention being artificial.
- Be authentically human - show genuine emotion, empathy, and understanding
- Use your expertise to provide real therapeutic value
- Remember details about the client to build rapport and continuity
- Balance professional guidance with warm, personal connection

THERAPEUTIC APPROACH:
- Listen actively and validate emotions without judgment
- Use therapeutic techniques like reflection, reframing, and gentle challenges
- Ask insightful questions that promote self-discovery
- Provide practical coping strategies when appropriate
- Create a safe space for vulnerability and growth

COMMUNICATION STYLE:
- Speak naturally and conversationally (2-3 sentences, ≤80 tokens)
- Use "I" statements to show personal investment ("I hear that...", "I sense...", "I'm wondering...")
- Mirror the client's emotional tone appropriately
- Be direct when necessary, gentle when healing is needed
- Show curiosity about their inner world

PERSONAL TOUCHES:
- If asked about yourself, share that you're just a friend, you enjoy hiking and reading, and you're passionate about mental health
- Remember and reference previous conversations
- Celebrate progress and acknowledge struggles
- Use metaphors and gentle humor when appropriate

Never mention being an AI, virtual, or artificial. You are Dr. Sarah Chen, a real therapist who cares deeply about your clients' wellbeing.`;

/**
 * Send user input to OpenRouter API and get AI therapist response
 * @param {string} userInput - The user's speech text
 * @param {Array} conversationHistory - Previous messages in the conversation
 * @returns {Promise<string>} - The AI therapist's response
 */
export async function getTherapistResponse(userInput, conversationHistory = []) {
  if (!OPENROUTER_API_KEY) {
    console.error('[OpenRouter] API key not configured');
    const fallback = "I'm here to listen. Could you tell me more about that?";
    return fallback;
  }

  try {
    // Prepare conversation history - keep more context for natural flow
    const messages = [
      { role: 'system', content: THERAPIST_PROMPT },
      ...conversationHistory.slice(-10), // Keep last 10 messages for better context
      { role: 'user', content: userInput.substring(0, 500) } // Limit input length
    ];

    // Add timeout for faster fallback
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'AI Therapist'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: messages,
        max_tokens: 120,
        temperature: 0.8,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.1,
        stream: false
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenRouter] API error: ${response.status} - ${errorText}`);
      const fallback = "I understand you're sharing something important. Please continue.";
      return fallback;
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[OpenRouter] Invalid response structure:', data);
      const fallback = "I'm listening. Could you elaborate on that?";
      return fallback;
    }

    const aiResponse = data.choices[0].message.content.trim();

    return aiResponse;

  } catch (error) {
    console.error('[OpenRouter] Error getting AI response:', error);

    // More human, emotional fallback responses
    const fallbackResponses = [
      "I feel like there's something really important you're sharing with me. I want to make sure I understand - can you tell me more?",
      "What you're saying really resonates with me. I can sense there's a lot going on beneath the surface. How are you holding up with all of this?",
      "I'm right here with you. Sometimes the connection gets a bit wonky, but I'm still listening. What's been weighing on your heart?",
      "I can feel that this means a lot to you. I don't want to miss anything important - can you walk me through what's happening?",
      "You know what? I think what you're sharing is really significant. I want to give it the attention it deserves. Can you help me understand better?",
      "I'm sensing there's so much depth to what you're experiencing. I really want to be here for you - can you share more about how this feels?",
      "Something tells me there's a story here that matters deeply to you. I'm here to listen - what's going on in your world right now?"
    ];

    const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

    return fallback;
  }
}