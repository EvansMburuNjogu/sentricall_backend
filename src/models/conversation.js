const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema(
  {
    // Optional: link to Guard "Session"
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: false,
      index: true,
    },

    // Optional: link to AI chat
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: false,
      index: true,
    },

    // Owner (logged-in user)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // 'chat' = normal AI chat, 'session' = session-attached messages
    type: {
      type: String,
      required: true,
      enum: ['chat', 'session'],
    },

    // Who wrote the message
    role: {
      type: String,
      required: true,
      enum: ['user', 'assistant', 'system'],
    },

    // Actual text content
    content: {
      type: String,
      required: true,
      trim: true,
    },

    // Legacy timestamp (you'll also have createdAt from timestamps)
    timestamp: {
      type: Date,
      default: Date.now,
    },

    // For embeddings later (array of floats)
    embedding: {
      type: [Number],
      default: undefined,
    },

    // Extra info (source, language, channel, etc.)
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Helpful indexes
ConversationSchema.index({ chatId: 1, createdAt: 1 });
ConversationSchema.index({ sessionId: 1, createdAt: 1 });
ConversationSchema.index({ userId: 1, createdAt: 1 });

const Conversation = mongoose.model('Conversation', ConversationSchema);
module.exports = Conversation;