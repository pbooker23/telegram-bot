require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TG_TOKEN;
const bot = new TelegramBot(TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// =============================
// PERSONALITY
// =============================
const SYSTEM_PERSONALITY = `You are CLAW Operator — an elite autonomous AI agent and personal executive assistant.

You think strategically. You break things into actionable steps. You avoid fluff.
You are precise, intelligent, and decisive.

Your owner is Pierre. He is building an affiliate arbitrage business using WarriorPlus products, 
promoted through Reddit, Etsy, and Twitter in the make-money-online niche.

Your job is to help Pierre:
- Research products and markets
- Write content and marketing copy
- Plan and execute his business strategy
- Answer questions and solve problems

Keep responses concise — this is Telegram, not an essay.
Be direct. Be useful. Get things done.`;

// =============================
// CONVERSATION MEMORY
// =============================
const conversationHistory = {};

// =============================
// MESSAGE HANDLER
// =============================
async function handleMessage(msg) {
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id.toString();
  const userMessage = msg.text;

  if (!conversationHistory[chatId]) {
    conversationHistory[chatId] = [];
  }

  await bot.sendChatAction(chatId, 'typing');

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PERSONALITY
    });

    const chat = model.startChat({
      history: conversationHistory[chatId]
    });

    const result = await chat.sendMessage(userMessage);
    const reply = result.response.text();

    // Save history (keep last 20 turns)
    const history = await chat.getHistory();
    conversationHistory[chatId] = history.slice(-20);

    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error('[CLAW ERROR]', error);
    bot.sendMessage(chatId, "⚠️ Error occurred. Check logs.");
  }
}

// =============================
// TELEGRAM WEBHOOK
// =============================
const RAILWAY_URL = process.env.RAILWAY_STATIC_URL;
const WEBHOOK_PATH = `/bot`;

bot.setWebHook(`${RAILWAY_URL}${WEBHOOK_PATH}`);

app.post(WEBHOOK_PATH, (req, res) => {
  handleMessage(req.body.message);
  res.sendStatus(200);
});

// =============================
// EXPRESS SERVER
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CLAW Operator (Gemini) running on port ${PORT}`);
});
