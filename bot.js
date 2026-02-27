require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { Pool } = require('pg');

/* =============================
   TELEGRAM BOT
============================= */

const bot = new TelegramBot(process.env.TG_TOKEN, {
  polling: {
    autoStart: true,
    interval: 300,
    params: { timeout: 10 }
  }
});

/* =============================
   OPENAI CLIENT (NEW API)
============================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =============================
   DATABASE CONNECTION
============================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
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

initDB().catch(console.error);

/* =============================
   PERSONALITY
============================= */

const SYSTEM_PERSONALITY = `
You are CLAW Operator.
You operate like an elite executive assistant.
You think strategically.
You break things into actionable steps.
You avoid fluff.
You structure responses clearly.
Be precise.
Be intelligent.
Be decisive.
`;

/* =============================
   COMMAND ROUTER
============================= */

function routeCommand(text) {
  if (text.startsWith("/create_order")) return "CREATE_ORDER";
  if (text.startsWith("/add_task")) return "ADD_TASK";
  if (text.startsWith("/analyze")) return "ANALYZE";
  if (text.startsWith("/brainstorm")) return "BRAINSTORM";
  if (text.startsWith("/daily_brief")) return "DAILY_BRIEF";
  return "GENERAL";
}

/* =============================
   MEMORY
============================= */

async function saveMemory(chatId, role, content) {
  await pool.query(
    "INSERT INTO user_memory (chat_id, role, content) VALUES ($1, $2, $3)",
    [chatId, role, content]
  );
}

async function getRecentMemory(chatId) {
  const result = await pool.query(
    `SELECT role, content 
     FROM user_memory 
     WHERE chat_id = $1 
     ORDER BY created_at DESC 
     LIMIT 10`,
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
  const commandType = routeCommand(userMessage);

  let structuredPrompt = "";

  switch (commandType) {
    case "CREATE_ORDER":
      structuredPrompt = `
User wants to create an order.
Extract structured order details.
If missing information, ask clear follow-up questions.
Provide formatted order summary.
User input:
${userMessage}`;
      break;

    case "ADD_TASK":
      structuredPrompt = `
User is adding a task.
Organize into:
- Task
- Priority
- Deadline
- Next Action
User input:
${userMessage}`;
      break;

    case "ANALYZE":
      structuredPrompt = `
Break down into:
1. Situation
2. Risks
3. Opportunities
4. Recommended Action
User input:
${userMessage}`;
      break;

    case "BRAINSTORM":
      structuredPrompt = `
Generate structured ideas categorized clearly.
User input:
${userMessage}`;
      break;

    case "DAILY_BRIEF":
      structuredPrompt = `
Generate a high-performance daily briefing including:
- Priority focus
- Revenue move
- Risk to avoid
- Quick win`;
      break;

    default:
      structuredPrompt = userMessage;
  }

  try {
    const memory = await getRecentMemory(chatId);

    const conversation = [
      { role: "system", content: SYSTEM_PERSONALITY },
      ...memory,
      { role: "user", content: structuredPrompt }
    ];

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: conversation
    });

    const reply = response.output_text;

    await saveMemory(chatId, "user", userMessage);
    await saveMemory(chatId, "assistant", reply);

    await bot.sendMessage(chatId, reply);

  } catch (err) {
    console.error("Error:", err.message);
    await bot.sendMessage(chatId, "System error. Check logs.");
  }
});

/* =============================
   GRACEFUL SHUTDOWN
============================= */

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await bot.stopPolling();
  await pool.end();
  process.exit(0);
});

console.log("CLAW Operator with Persistent Memory is live.");
