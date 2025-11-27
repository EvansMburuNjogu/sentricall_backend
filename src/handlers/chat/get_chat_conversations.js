// handlers/chat/get_chat_conversations.js
const Conversation = require('../../models/conversation');

const get_chat_conversations = async (req, res) => {
  try {
    const { chatId } = req.params;

    if (!chatId) {
      return res.status(400).json({ message: 'chatId is required' });
    }

    const conversations = await Conversation.find({
      chatId: chatId,
      type: 'chat',          // makes it explicit
    })
      .sort({ createdAt: 1 }); // oldest -> newest

    res
      .status(200)
      .json({ message: 'Chat conversations fetched successfully.', conversations });
  } catch (err) {
    console.error('get_chat_conversations error:', err);
    res
      .status(500)
      .json({ message: 'Error getting chat conversations', error: err.message });
  }
};

module.exports = get_chat_conversations;