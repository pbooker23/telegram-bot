require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const Redis = require('ioredis');

// ======================================
// ENV VALIDATION
// ======================================
const {
  TG_TOKEN,
  GROQ_API_KEY,
  REDIS_URL,
  PORT = 8080
} = process.env;

if (!TG_TOKEN) throw new Error('Missing TG_TOKEN');
if (!GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY');
if (!REDIS_URL) throw new Error('Missing REDIS_URL');

// ======================================
// INIT
// ======================================
const app = express();
const redis = new Redis(REDIS_URL);
const bot = new TelegramBot(TG_TOKEN, { polling: true });

// ======================================
// SYSTEM PERSONALITY
// ======================================
const SYSTEM_PERSONALITY = `You are CLAW Operator — an elite autonomous AI executive assistant.

Your owner is Pierre. He is building an affiliate arbitrage business using WarriorPlus products,
promoted through Reddit, Etsy, and Twitter in the make-money-online niche.

Your responsibilities:
- Research markets and products
- Write conversion-focused content
- Build execution plans
- Solve business problems
- Prioritize revenue-generating actions

Rules:
- Be concise and direct
- Give actionable steps
- Think strategically
- Optimize for leverage and speed
- Telegram responses should be compact`;

// ======================================
// GROQ API CALL
// ======================================
async function callGroq(messages) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 1024,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ======================================
// COOLDOWN
// ======================================
const cooldowns = new Map();

function isCoolingDown(chatId) {
  if (cooldowns.has(chatId)) return true;
  cooldowns.set(chatId, true);
  setTimeout(() => cooldowns.delete(chatId), 2500);
  return false;
}

// ======================================
// MEMORY FUNCTIONS
// ======================================
async function getHistory(chatId) {
  try {
    const data = await redis.get(`history:${chatId}`);
    if (!data) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error('[REDIS GET ERROR]', err);
    return [];
  }
}

async function saveHistory(chatId, history) {
  try {
    const trimmed = history.slice(-20);
    await redis.set(
      `history:${chatId}`,
      JSON.stringify(trimmed),
      'EX',
      60 * 60 * 24 * 7
    );
  } catch (err) {
    console.error('[REDIS SAVE ERROR]', err);
  }
}

async function clearHistory(chatId) {
  try {
    await redis.del(`history:${chatId}`);
  } catch (err) {
    console.error('[REDIS DELETE ERROR]', err);
  }
}

// ======================================
// COMMAND HANDLER
// ======================================
async function handleCommands(chatId, text) {
  if (text === '/start') {
    await bot.sendMessage(chatId, '⚡ CLAW Operator online.');
    return true;
  }
  if (text === '/reset') {
    await clearHistory(chatId);
    await bot.sendMessage(chatId, '🧠 Memory cleared.');
    return true;
  }
  if (text === '/help') {
    await bot.sendMessage(chatId, `Available commands:\n\n/start - Start bot\n/reset - Clear memory\n/help - Show commands`);
    return true;
  }
  return false;
}

// ======================================
// INPUT SANITIZATION
// ======================================
function sanitizeInput(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>?/gm, '').trim().slice(0, 4000);
}

// ======================================
// MAIN MESSAGE HANDLER
// ======================================
bot.on('message', async (msg) => {
  try {
    if (!msg || !msg.text) return;

    const chatId = String(msg.chat.id);
    const userMessage = sanitizeInput(msg.text);

    if (!userMessage) return;

    if (isCoolingDown(chatId)) {
      return bot.sendMessage(chatId, '⏳ Slow down a little.');
    }

    const commandHandled = await handleCommands(chatId, userMessage);
    if (commandHandled) return;

    await bot.sendChatAction(chatId, 'typing');

    // Load history
    const history = await getHistory(chatId);

    // Build messages array for Groq
    const messages = [
      { role: 'system', content: SYSTEM_PERSONALITY },
      ...history,
      { role: 'user', content: userMessage }
    ];

    // Call Groq
    const reply = await callGroq(messages);

    // Save updated history
    const updatedHistory = [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: reply }
    ];
    await saveHistory(chatId, updatedHistory);

    await bot.sendMessage(chatId, reply, {
      disable_web_page_preview: true
    });

  } catch (error) {
    console.error('[CLAW ERROR]', error);

    let errorMessage = '⚠️ System temporarily unavailable.';
    if (error.message?.includes('quota')) errorMessage = '⚠️ API quota exceeded.';
    if (error.message?.includes('API key')) errorMessage = '⚠️ Invalid API configuration.';

    try {
      await bot.sendMessage(msg.chat.id, errorMessage);
    } catch (e) {
      console.error('[TELEGRAM ERROR]', e);
    }
  }
});

// ======================================
// HEALTHCHECK
// ======================================
app.get('/', (req, res) => res.send('CLAW Operator running'));

app.listen(PORT, () => {
  console.log(`
======================================
CLAW Operator ONLINE (Groq)
Port: ${PORT}
======================================
`);
});

// ======================================
// GRACEFUL SHUTDOWN
// ======================================
process.on('SIGINT', async () => {
  try { await redis.quit(); } catch (e) {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  try { await redis.quit(); } catch (e) {}
  process.exit(0);
});
  
