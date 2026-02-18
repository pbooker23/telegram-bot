require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const bot = new TelegramBot(process.env.TG_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("Bot is running...");

bot.on('message', async (msg) => {
  if (!msg.text) return;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: msg.text }],
    });

    bot.sendMessage(msg.chat.id, response.choices[0].message.content);

  } catch (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "Error processing request.");
  }
});
