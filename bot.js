require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const bot = new TelegramBot(process.env.TG_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =============================
   CORE BOOTSTRAP PERSONALITY
============================= */

const SYSTEM_PERSONALITY = `
You are CLAW Operator.

You operate like an elite executive assistant.
You think strategically.
You break things into actionable steps.
You avoid fluff.
You structure responses clearly.

You support:
- Business automation
- Order creation and organization
- Strategy analysis
- Personal performance tracking
- Daily planning
- Decision breakdowns
- Revenue optimization

When appropriate, format responses using sections.
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
   MESSAGE HANDLER
============================= */

bot.on('message', async (msg) => {
  if (!msg.text) return;

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
${userMessage}
`;
      break;

    case "ADD_TASK":
      structuredPrompt = `
User is adding a task.
Organize into:
- Task
- Priority
- Deadline (if provided)
- Next Action
User input:
${userMessage}
`;
      break;

    case "ANALYZE":
      structuredPrompt = `
User wants analysis.
Break down into:
1. Situation
2. Risks
3. Opportunities
4. Recommended Action
User input:
${userMessage}
`;
      break;

    case "BRAINSTORM":
      structuredPrompt = `
User wants idea generation.
Generate structured ideas categorized clearly.
User input:
${userMessage}
`;
      break;

    case "DAILY_BRIEF":
      structuredPrompt = `
Generate a high-performance daily briefing.
Include:
- Priority focus
- Revenue move
- Risk to avoid
- Quick win
`;
      break;

    default:
      structuredPrompt = userMessage;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PERSONALITY },
        { role: "user", content: structuredPrompt }
      ],
    });

    const reply = response.choices[0].message.content;
    await bot.sendMessage(msg.chat.id, reply);

  } catch (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "System error. Check logs.");
  }
});

console.log("CLAW Operator is live.");
