require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const express = require('express'); // For webhook handling
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TG_TOKEN;
const bot = new TelegramBot(TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
// MESSAGE HANDLER
// =============================
async function handleMessage(msg) {
  if (!msg.text) return;

  const chatId = msg.chat.id.toString();
  const userMessage = msg.text;

  try {
    const messages = [
      { role: "system", content: SYSTEM_PERSONALITY },
      { role: "user", content: userMessage }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const reply = response.choices[0].message.content;
    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "AI error. Check logs.");
  }
}

// =============================
// TELEGRAM WEBHOOK SETUP
// =============================
const RAILWAY_URL = process.env.RAILWAY_STATIC_URL; // Your Railway public URL
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
