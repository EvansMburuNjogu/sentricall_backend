// src/handlers/session/ask_session.js
const Session = require('../../models/session');
const Conversation = require('../../models/conversation');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

const ask_session = async (req, res) => {
  try {
    // 🔐 Be flexible with what jwt middleware sets
    const userId =
      (req.user && (req.user.id || req.user._id || req.user.userId)) || null;

    const sessionId = req.params.sessionId;
    const { question, language } = req.body || {};

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    if (!question || !question.trim()) {
      return res.status(400).json({ message: 'question is required' });
    }

    // ✅ Ensure this session belongs to this user
    const session = await Session.findOne({ _id: sessionId, userId }).lean();
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const cleanQuestion = question.trim();

    // 1) Save user message (tied to session + user)
    const userConversation = await Conversation.create({
      sessionId,
      userId,
      type: 'session',
      role: 'user',
      content: cleanQuestion,
      metadata: {
        language: language || 'auto',
        source: 'mobile_app',
      },
    });

    // 2) Load last N messages in this session as context
    const history = await Conversation.find({
      sessionId,
      userId,
      type: 'session',
    })
      .sort({ createdAt: 1 })
      .limit(20)
      .lean();

    const systemPrompt = `
You are SentriCall Copilot, an AI safety assistant.
You are helping the user review and understand a specific recorded session
(e.g. a phone call, website scan, or online interaction).

You must:
- Help the user spot red flags of scams, fraud and social engineering in this session.
- Explain clearly and calmly, using simple language.
- Always encourage the user to verify with official channels when money or personal data is involved.
- If a situation looks dangerous or urgent, advise the user to STOP, HANG UP and confirm via official contacts.
- You can answer in English or Swahili. If the user writes in Swahili, reply in Swahili.
- Do NOT give investment tips or trading signals. Focus on fraud awareness, safety, and what the recorded session suggests.
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
      console.error('OpenAI error in ask_session:', err);

      // Same quota handling as chat
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
      sessionId,
      userId,
      type: 'session',
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
    console.error('ask_session error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error talking to Copilot. Please try again.',
    });
  }
};

module.exports = ask_session;