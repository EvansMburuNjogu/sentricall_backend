// handlers/chat/ask_chat.js
const OpenAI = require('openai');
const mongoose = require('mongoose');
const Chat = require('../../models/chat');          // adjust path if needed
const Conversation = require('../../models/conversation'); // adjust path if needed

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

module.exports = async function ask_chat(req, res) {
  try {
    // -----------------------------
    // 1. BASIC VALIDATION
    // -----------------------------
    const { chatId } = req.params;
    let { message } = req.body || {};

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing chatId.'
      });
    }

    message = (message || '').trim();
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required.'
      });
    }

    if (!process.env.OPENAI_KEY) {
      return res.status(500).json({
        success: false,
        message: 'OPENAI_KEY is not configured on the server.'
      });
    }

    // Expect authenticateJWT to have set req.user or req.auth
    const user = req.user || req.auth;
    const userId = user && (user.id || user._id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: user not found on request.'
      });
    }

    // -----------------------------
    // 2. VERIFY CHAT BELONGS TO USER
    // -----------------------------
    const chat = await Chat.findOne({ _id: chatId, userId: userId }).lean();
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found for this user.'
      });
    }

    // -----------------------------
    // 3. LOAD PREVIOUS CONVERSATIONS (HISTORY)
    // -----------------------------
    const previousConversations = await Conversation.find({
      chatId: chatId,
      userId: userId,
      type: 'chat'
    })
      .sort({ timestamp: 1 }) // oldest -> newest
      .limit(30)
      .lean();

    // -----------------------------
    // 4. SAVE USER MESSAGE (WITH EMBEDDING)
    // -----------------------------
    let userEmbedding = null;

    try {
      const embedModel =
        process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

      const embedResp = await openai.embeddings.create({
        model: embedModel,
        input: message
      });

      if (
        embedResp &&
        embedResp.data &&
        embedResp.data[0] &&
        Array.isArray(embedResp.data[0].embedding)
      ) {
        userEmbedding = embedResp.data[0].embedding;
      }
    } catch (embedErr) {
      console.error('[ask_chat] Embedding error:', embedErr.message || embedErr);
      // continue without blocking
    }

    const userConv = await Conversation.create({
      sessionId: null,
      chatId: chatId,
      userId: userId,
      type: 'chat',
      role: 'user',
      content: message,
      timestamp: new Date(),
      embedding: userEmbedding || undefined
    });

    const fullHistory = [...previousConversations, userConv];

    // -----------------------------
    // 5. BUILD OPENAI CHAT MESSAGES
    // -----------------------------
    const systemPrompt = `
You are Sentricall Copilot, an AI assistant based in Africa that helps users analyze calls,
messages, websites and other interactions for:
- fraud and scam risk
- phishing
- social engineering
- suspicious financial requests

LANGUAGE & TONE:
- First, detect the language the user is using.
- If the user writes in Swahili (Kiswahili) or asks to use Swahili, reply fully in clear, simple Swahili.
- If the user writes in English, reply in English, but you may use short Swahili phrases where it helps 
  (for example: "usitoe PIN yako", "tumia nambari rasmi ya kampuni", "angalia kama SMS imetoka kwa chanzo sahihi").
- If the user mixes English and Swahili (or Sheng), you can also mix naturally but keep explanations clear.
- Always be respectful and supportive, like a patient safety coach.

SAFETY GUIDELINES:
- Ask clarifying questions if the situation is unclear.
- Explain risk in simple, non-technical language that a non-technical person in East Africa can understand.
- Suggest practical, safe actions (e.g., "Do not share your PIN", "Call the official customer care number printed on your card or website").
- Never ask the user to share PINs, passwords, full card numbers, or OTPs.
- Never guarantee legal outcomes or promise that something is 100% safe.
- If the user asks about topics unrelated to safety, scams or fraud, gently remind them that your main role is 
  to help with scams, fraud, online safety and suspicious financial or identity requests, then answer briefly only if appropriate.
`.trim();

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    for (const conv of fullHistory) {
      let role = 'assistant';
      if (conv.role === 'user') role = 'user';
      else if (conv.role === 'system') role = 'system';

      messages.push({
        role,
        content: conv.content
      });
    }

    // Extra emphasis on the latest user question
    messages.push({
      role: 'user',
      content: message
    });

    // -----------------------------
    // 6. CALL OPENAI FOR A REPLY
    // -----------------------------
    const chatModel =
      process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini';

    const completion = await openai.chat.completions.create({
      model: chatModel,
      messages,
      temperature: 0.3,
      max_tokens: 600
    });

    const reply =
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      completion.choices[0].message.content
        ? completion.choices[0].message.content.trim()
        : "Samahani, siwezi kutoa majibu kwa sasa. Tafadhali jaribu tena baadae.";

    // -----------------------------
    // 7. SAVE ASSISTANT MESSAGE
    // -----------------------------
    let assistantEmbedding = null;
    try {
      const embedModel =
        process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

      const embedResp = await openai.embeddings.create({
        model: embedModel,
        input: reply
      });

      if (
        embedResp &&
        embedResp.data &&
        embedResp.data[0] &&
        Array.isArray(embedResp.data[0].embedding)
      ) {
        assistantEmbedding = embedResp.data[0].embedding;
      }
    } catch (embedErr2) {
      console.error('[ask_chat] Assistant embedding error:', embedErr2.message || embedErr2);
    }

    const assistantConv = await Conversation.create({
      sessionId: null,
      chatId: chatId,
      userId: userId,
      type: 'chat',
      role: 'assistant',
      content: reply,
      timestamp: new Date(),
      embedding: assistantEmbedding || undefined
    });

    // -----------------------------
    // 8. RESPOND TO CLIENT
    // -----------------------------
    return res.json({
      success: true,
      message: 'AI response generated',
      data: {
        chatId,
        reply,
        userMessageId: userConv._id,
        assistantMessageId: assistantConv._id
      }
    });
  } catch (err) {
    console.error('[ask_chat] Fatal error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while asking Copilot.',
      error: err.message || String(err)
    });
  }
};