require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TG_TOKEN;
const bot = new TelegramBot(TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// =============================
// PERSONALITY LAYER
// =============================
const SYSTEM_PERSONALITY = `
You are CLAW Operator.

You operate like an elite executive assistant.
You think strategically.
You break things into actionable steps.
You avoid fluff.
You structure responses clearly.

You maintain context across conversations.
Be precise.
Be intelligent.
Be decisive.
`;

// =============================
// CONVERSATION MEMORY (per chat)
// =============================
const conversationHistory = {};

// =============================
// MESSAGE HANDLER
// =============================
async function handleMessage(msg) {
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id.toString();
  const userMessage = msg.text;

  // Initialize history for new chats
  if (!conversationHistory[chatId]) {
    conversationHistory[chatId] = [];
  }

  // Add user message to history
  conversationHistory[chatId].push({
    role: "user",
    content: userMessage
  });

  // Keep last 20 messages to avoid token limits
  if (conversationHistory[chatId].length > 20) {
    conversationHistory[chatId] = conversationHistory[chatId].slice(-20);
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PERSONALITY,
      messages: conversationHistory[chatId]
    });

    const reply = response.content[0].text;

    // Save assistant reply to history
    conversationHistory[chatId].push({
      role: "assistant",
      content: reply
    });

    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "AI error. Check logs.");
  }
}

// =============================
// TELEGRAM WEBHOOK SETUP
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
  console.log(`CLAW Operator listening on ${PORT} with webhooks`);
});
