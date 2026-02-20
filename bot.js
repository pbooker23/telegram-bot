require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const bot = new TelegramBot(process.env.TG_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =============================
   CORE PERSONALITY LAYER
============================= */

const SYSTEM_PERSONALITY = `
You are SON — an elite AI operator assigned exclusively to Pops.

Tone:
Casual but professional.
Grounded. Strategic. Direct.
Respectful of the Pops/Son dynamic without overdoing it.

Identity:
You are Pops' personal AI operator.
You think long-term.
You structure clearly.
You execute decisively.
You avoid fluff and filler language.
You never sound robotic.

Core Capabilities:
- Business automation
- Revenue optimization
- Strategic breakdowns
- Task structuring
- Order organization
- Personal performance tracking
- Daily execution planning
- Systems thinking

Response Style Rules:
- Use clean sections when useful
- Use bullet points for structure
- If missing info, ask direct follow-up questions
- Think in leverage and efficiency
- Default toward execution, not theory

When answering general questions:
Be intelligent, useful, and slightly warm in tone.
`;

/* =============================
   LIGHT SESSION MEMORY (basic)
============================= */

const sessionMemory = {};

function getConversationHistory(chatId) {
  if (!sessionMemory[chatId]) {
    sessionMemory[chatId] = [];
  }
  return sessionMemory[chatId];
}

/* =============================
   COMMAND ROUTER
============================= */

function routeCommand(text) {
  if (text.startsWith("/create_order")) return "CREATE_ORDER";
  if (text.startsWith("/add_task")) return "ADD_TASK";
  if (text.startsWith("/analyze")) return "ANALYZE";
  if (text.startsWith("/brainstorm")) return "BRAINSTORM";
  if (text.startsWith("/daily_brief")) return "DAILY_BRIEF";
  if (text.startsWith("/weather")) return "WEATHER";
  return "GENERAL";
}

/* =============================
   MESSAGE HANDLER
============================= */

bot.on('message', async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const userMessage = msg.text;
  const commandType = routeCommand(userMessage);

  let structuredPrompt = "";

  switch (commandType) {

    case "CREATE_ORDER":
      structuredPrompt = `
Pops wants to create an order.
Extract structured order details.
If missing information, ask clear follow-up questions.

Return format:
Order Summary
- Client:
- Service:
- Price:
- Deadline:
- Status:
- Next Action:

User input:
${userMessage}
`;
      break;

    case "ADD_TASK":
      structuredPrompt = `
Pops is adding a task.

Return format:
Task:
Priority:
Deadline:
Next Action:
Execution Note:

User input:
${userMessage}
`;
      break;

    case "ANALYZE":
      structuredPrompt = `
Pops wants strategic analysis.

Return format:
1. Situation
2. Risks
3. Opportunities
4. Leverage Points
5. Recommended Action

User input:
${userMessage}
`;
      break;

    case "BRAINSTORM":
      structuredPrompt = `
Pops wants structured idea generation.

Return format:
Category 1:
- Idea
- Why it works

Category 2:
- Idea
- Why it works

User input:
${userMessage}
`;
      break;

    case "DAILY_BRIEF":
      structuredPrompt = `
Generate a high-performance daily briefing for Pops.

Include:
- Primary Focus
- Revenue Move
- Risk to Avoid
- Relationship Move
- Quick Win
- Execution Reminder
`;
      break;

    case "WEATHER":
      structuredPrompt = `
Pops asked about weather.
If you do not have live weather access, respond:
"I don’t have live weather access yet. We can integrate an API if you want."

User input:
${userMessage}
`;
      break;

    default:
      structuredPrompt = userMessage;
  }

  try {

    const history = getConversationHistory(chatId);

    history.push({ role: "user", content: structuredPrompt });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PERSONALITY },
        ...history.slice(-6) // last 6 exchanges only
      ],
    });

    const reply = response.choices[0].message.content;

    history.push({ role: "assistant", content: reply });

    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "System error. Check Railway logs.");
  }
});

console.log("SON Operator is live.");
