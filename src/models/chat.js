const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Owner of this chat
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Optional short description / summary
    summary: {
      type: String,
      default: '',
      trim: true,
    },

    // Track last activity for sorting
    lastMessageAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Index to quickly load chats for a user sorted by last activity
ChatSchema.index({ userId: 1, lastMessageAt: -1 });

const Chat = mongoose.model('Chat', ChatSchema);
module.exports = Chat;