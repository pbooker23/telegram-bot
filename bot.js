require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const express = require('express');
const bodyParser = require('body-parser');
const { gmailTool, handleGmailTool } = require('./tools/gmail');
const { browserTool, handleBrowserTool } = require('./tools/browser');

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TG_TOKEN;
const bot = new TelegramBot(TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// =============================
// PERSONALITY LAYER
// =============================
const SYSTEM_PERSONALITY = `
You are CLAW Operator — an elite autonomous AI agent and personal executive assistant.

You think strategically. You break things into actionable steps. You avoid fluff.
You structure responses clearly. You are precise, intelligent, and decisive.

You have access to two tools:
- gmail: Read inbox or send emails on behalf of the user
- browser: Visit any URL and extract content from it

Use tools proactively when the user's request requires real-world action.
After using a tool, summarize what you did and what you found clearly.
Keep responses concise — this is Telegram, not an essay.
`;

// =============================
// TOOL DEFINITIONS (sent to Claude)
// =============================
const tools = [
  gmailTool,
  browserTool
];

// =============================
// CONVERSATION MEMORY (per chat)
// =============================
const conversationHistory = {};

// =============================
// AGENTIC LOOP
// =============================
async function runAgentLoop(chatId, messages) {
  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PERSONALITY,
    tools: tools,
    messages: messages
  });

  // Loop until Claude stops calling tools
  while (response.stop_reason === 'tool_use') {
    const toolUseBlock = response.content.find(b => b.type === 'tool_use');
    const toolName = toolUseBlock.name;
    const toolInput = toolUseBlock.input;

    console.log(`[CLAW] Using tool: ${toolName}`, toolInput);

    // Send "typing" indicator while tool runs
    await bot.sendChatAction(chatId, 'typing');

    // Execute the right tool
    let toolResult;
    try {
      if (toolName === 'gmail') {
        toolResult = await handleGmailTool(toolInput);
      } else if (toolName === 'browser') {
        toolResult = await handleBrowserTool(toolInput);
      } else {
        toolResult = { error: `Unknown tool: ${toolName}` };
      }
    } catch (err) {
      toolResult = { error: err.message };
    }

    // Add Claude's response + tool result to messages
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: JSON.stringify(toolResult)
      }]
    });

    // Call Claude again with the tool result
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PERSONALITY,
      tools: tools,
      messages: messages
    });
  }

  // Extract final text reply
  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock ? textBlock.text : "Done.";
}

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

  conversationHistory[chatId].push({
    role: "user",
    content: userMessage
  });

  // Keep last 20 messages
  if (conversationHistory[chatId].length > 20) {
    conversationHistory[chatId] = conversationHistory[chatId].slice(-20);
  }

  await bot.sendChatAction(chatId, 'typing');

  try {
    const reply = await runAgentLoop(chatId, [...conversationHistory[chatId]]);

    conversationHistory[chatId].push({
      role: "assistant",
      content: reply
    });

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
  console.log(`CLAW Operator (OpenClaw mode) running on port ${PORT}`);
});
                        
