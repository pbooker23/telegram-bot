require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');

const app = express();

const TOKEN = process.env.TG_TOKEN;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use polling instead of webhook — no URL needed, works anywhere
const bot = new TelegramBot(TOKEN, { polling: true });

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
bot.on('message', async (msg) => {
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id.toString();
  const userMessage = msg.text;

  if (!conversationHistory[chatId]) {
    conversationHistory[chatId] = [];
  }

  await bot.sendChatAction(chatId, 'typing');

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
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
});

// =============================
// EXPRESS SERVER (keeps Railway happy)
// =============================
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('CLAW Operator running'));
app.listen(PORT, () => {
  console.log(`CLAW Operator (Gemini) running on port ${PORT}`);
});
