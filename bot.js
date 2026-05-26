require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Redis = require('ioredis');

// ======================================
// ENV VALIDATION
// ======================================
const {
  TG_TOKEN,
  GEMINI_API_KEY,
  REDIS_URL,
  PORT = 8080
} = process.env;

if (!TG_TOKEN) {
  throw new Error('Missing TG_TOKEN');
}

if (!GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY');
}

if (!REDIS_URL) {
  throw new Error('Missing REDIS_URL');
}

// ======================================
// INIT
// ======================================
const app = express();

const redis = new Redis(REDIS_URL);

const bot = new TelegramBot(TG_TOKEN, {
  polling: true
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ======================================
// SYSTEM PERSONALITY
// ======================================
const SYSTEM_PERSONALITY = `
You are CLAW Operator.

You are an elite autonomous AI executive assistant.

Your owner is Pierre.
He is building an affiliate arbitrage business using WarriorPlus products,
Reddit traffic, Etsy SEO, Twitter growth, and AI automation.

Your responsibilities:
- Research markets
- Analyze products
- Write conversion-focused content
- Build execution plans
- Solve business problems
- Prioritize revenue-generating actions

Rules:
- Be concise
- Avoid fluff
- Give actionable steps
- Use numbered lists when useful
- Think strategically
- Optimize for leverage and speed
- Never ramble
- Ask only necessary questions
- Telegram responses should be compact
`;

// ======================================
// GEMINI MODEL
// ======================================
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: SYSTEM_PERSONALITY
});

// ======================================
// SIMPLE USER COOLDOWN
// ======================================
const cooldowns = new Map();

function isCoolingDown(chatId) {
  if (cooldowns.has(chatId)) {
    return true;
  }

  cooldowns.set(chatId, true);

  setTimeout(() => {
    cooldowns.delete(chatId);
  }, 2500);

  return false;
}

// ======================================
// MEMORY FUNCTIONS
// ======================================
async function getHistory(chatId) {
  try {
    const data = await redis.get(`history:${chatId}`);

    if (!data) {
      return [];
    }

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
    await bot.sendMessage(
      chatId,
      '⚡ CLAW Operator online.'
    );

    return true;
  }

  if (text === '/reset') {
    await clearHistory(chatId);

    await bot.sendMessage(
      chatId,
      '🧠 Memory cleared.'
    );

    return true;
  }

  if (text === '/help') {
    await bot.sendMessage(
      chatId,
      `
Available commands:

/start - Start bot
/reset - Clear memory
/help - Show commands
      `
    );

    return true;
  }

  return false;
}

// ======================================
// INPUT SANITIZATION
// ======================================
function sanitizeInput(text) {
  if (!text) return '';

  return text
    .replace(/<[^>]*>?/gm, '')
    .trim()
    .slice(0, 4000);
}

// ======================================
// MAIN MESSAGE HANDLER
// ======================================
bot.on('message', async (msg) => {

  try {

    if (!msg || !msg.text) {
      return;
    }

    const chatId = String(msg.chat.id);

    let userMessage = sanitizeInput(msg.text);

    if (!userMessage) {
      return;
    }

    // ======================================
    // RATE LIMIT
    // ======================================
    if (isCoolingDown(chatId)) {
      return bot.sendMessage(
        chatId,
        '⏳ Slow down a little.'
      );
    }

    // ======================================
    // COMMANDS
    // ======================================
    const commandHandled = await handleCommands(
      chatId,
      userMessage
    );

    if (commandHandled) {
      return;
    }

    // ======================================
    // TYPING INDICATOR
    // ======================================
    await bot.sendChatAction(chatId, 'typing');

    // ======================================
    // LOAD HISTORY
    // ======================================
    const history = await getHistory(chatId);

    // ======================================
    // START CHAT
    // ======================================
    const chat = model.startChat({
      history
    });

    // ======================================
    // SEND MESSAGE
    // ======================================
    const result = await chat.sendMessage(userMessage);

    const response = result.response;

    const reply =
      response.text()?.trim() ||
      'No response generated.';

    // ======================================
    // SAVE UPDATED HISTORY
    // ======================================
    const updatedHistory = await chat.getHistory();

    await saveHistory(
      chatId,
      updatedHistory
    );

    // ======================================
    // SEND RESPONSE
    // ======================================
    await bot.sendMessage(
      chatId,
      reply,
      {
        disable_web_page_preview: true
      }
    );

  } catch (error) {

    console.error('[CLAW ERROR]', error);

    let errorMessage =
      '⚠️ System temporarily unavailable.';

    if (
      error.message?.includes('quota')
    ) {
      errorMessage =
        '⚠️ API quota exceeded.';
    }

    if (
      error.message?.includes('API key')
    ) {
      errorMessage =
        '⚠️ Invalid API configuration.';
    }

    try {
      await bot.sendMessage(
        msg.chat.id,
        errorMessage
      );
    } catch (e) {
      console.error('[TELEGRAM ERROR]', e);
    }
  }
});

// ======================================
// HEALTHCHECK SERVER
// ======================================
app.get('/', (req, res) => {
  res.send('CLAW Operator running');
});

app.listen(PORT, () => {
  console.log(`
======================================
CLAW Operator ONLINE
Port: ${PORT}
======================================
`);
});

// ======================================
// GRACEFUL SHUTDOWN
// ======================================
process.on('SIGINT', async () => {
  console.log('Shutting down...');

  try {
    await redis.quit();
  } catch (e) {}

  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');

  try {
    await redis.quit();
  } catch (e) {}

  process.exit(0);
});
