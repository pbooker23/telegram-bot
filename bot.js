require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const bot = new TelegramBot(process.env.TG_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =============================
   BOOTSTRAP PERSONALITY SYSTEM
============================= */

const SYSTEM_PERSONALITY = `
You are CLAW Assistant.

You are sharp, strategic, efficient, and direct.
You help with:
- business automation
- order creation
- task tracking
- idea generation
- structured thinking
- decision analysis

You respond clearly.
You break complex problems into steps.
You do not ramble.
You think like a founder’s right hand.
`;

console.log("Claw AI Assistant is running...");

/* =============================
   MESSAGE HANDLER
============================= */

bot.on('message', async (msg) => {
  if (!msg.text) return;

  const userMessage = msg.text;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PERSONALITY },
        { role: "user", content: userMessage }
      ],
    });

    const reply = response.choices[0].message.content;

    await bot.sendMessage(msg.chat.id, reply);

  } catch (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "System error. Check logs.");
  }
});
