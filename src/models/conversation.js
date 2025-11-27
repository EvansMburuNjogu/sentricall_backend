const mongoose = require('mongoose');
const ConversationSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: false },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: false },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: ['chat', 'session'] },
    role: { type: String, required: true, enum: ['user', 'assistant', 'system'] },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', ConversationSchema);
module.exports = Conversation;