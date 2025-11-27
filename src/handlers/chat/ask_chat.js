// src/handlers/chat/ask_chat.js
const Chat = require('../../models/chat');
const Conversation = require('../../models/conversation');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

const ask_chat = async (req, res) => {
  try {
    // 🔐 Be flexible with what jwt middleware sets
    const userId =
      (req.user && (req.user.id || req.user._id || req.user.userId)) || null;

    const chatId = req.params.chatId;
    const { question, language } = req.body || {};

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!chatId) {
      return res.status(400).json({ message: 'chatId is required' });
    }

    if (!question || !question.trim()) {
      return res.status(400).json({ message: 'question is required' });
    }

    // ✅ Ensure this chat belongs to this user
    const chat = await Chat.findOne({ _id: chatId, userId }).lean();
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const cleanQuestion = question.trim();

    // 1) Save user message (tied to chat + user)
    const userConversation = await Conversation.create({
      chatId,
      userId,
      type: 'chat',
      role: 'user',
      content: cleanQuestion,
      metadata: {
        language: language || 'auto',
        source: 'mobile_app',
      },
    });

    // 2) Load last N messages as context for the model
    const history = await Conversation.find({
      chatId,
      userId,
      type: 'chat',
    })
      .sort({ createdAt: 1 })
      .limit(20)
      .lean();

    const systemPrompt = `
You are SentriCall Copilot, an AI safety assistant.
You help users understand and avoid scams, fraud and social engineering.

You must:
- Explain clearly and calmly.
- Always encourage the user to verify with official channels when money or personal data is involved.
- If a situation looks dangerous or urgent, advise the user to STOP, HANG UP and confirm via official contacts.
- You can answer in English or Swahili. If the user writes in Swahili, reply in Swahili.
- Do NOT give investment tips or trading signals. Focus on fraud awareness and safety.
`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content,
      })),
      { role: 'user', content: cleanQuestion },
    ];

    let answerText =
      'Samahani, siwezi kujibu hilo kwa sasa. Jaribu kuuliza kwa njia nyingine.';

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages,
        temperature: 0.3,
      });

      answerText =
        completion?.choices?.[0]?.message?.content?.trim() || answerText;
    } catch (err) {
      // If OpenAI fails, keep the user message saved and just return error
      console.error('OpenAI error in ask_chat:', err);

      if (err.status === 429 || err.code === 'insufficient_quota') {
        return res.status(429).json({
          ok: false,
          code: 'COPILOT_QUOTA_EXCEEDED',
          message:
            'Copilot is temporarily unavailable because the AI quota has been exceeded. Your message was saved – please try again later.',
        });
      }

      return res.status(500).json({
        ok: false,
        message: 'Error talking to Copilot. Please try again.',
      });
    }

    // 3) Save assistant reply
    const assistantConversation = await Conversation.create({
      chatId,
      userId,
      type: 'chat',
      role: 'assistant',
      content: answerText,
      metadata: {
        source: 'openai',
      },
    });

    return res.status(200).json({
      ok: true,
      answer: answerText,
      userConversation,
      assistantConversation,
    });
  } catch (err) {
    console.error('ask_chat error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error talking to Copilot. Please try again.',
    });
  }
};

module.exports = ask_chat;