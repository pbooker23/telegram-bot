require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { Pool } = require('pg');

const bot = new TelegramBot(process.env.TG_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =============================
   DATABASE CONNECTION
============================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =============================
   INIT TABLES
============================= */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_memory (
      id SERIAL PRIMARY KEY,
      chat_id TEXT,
      role TEXT,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

initDB();

/* =============================
   PERSONALITY LAYER
============================= */

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

/* =============================
   MEMORY FUNCTIONS
============================= */

async function saveMemory(chatId, role, content) {
  await pool.query(
    "INSERT INTO user_memory (chat_id, role, content) VALUES ($1, $2, $3)",
    [chatId, role, content]
  );
}

async function getRecentMemory(chatId) {
  const result = await pool.query(
    "SELECT role, content FROM user_memory WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 10",
    [chatId]
  );

  return result.rows.reverse();
}

/* =============================
   MESSAGE HANDLER
============================= */

bot.on('message', async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id.toString();
  const userMessage = msg.text;

  try {

    // Get memory
    const memory = await getRecentMemory(chatId);

    const messages = [
      { role: "system", content: SYSTEM_PERSONALITY },
      ...memory,
      { role: "user", content: userMessage }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const reply = response.choices[0].message.content;

    // Save memory
    await saveMemory(chatId, "user", userMessage);
    await saveMemory(chatId, "assistant", reply);

    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "Database or AI error. Check logs.");
  }
});

console.log("CLAW Operator with Persistent Memory is live.");
