const mongoose = require('mongoose');
const ChatSchema = new mongoose.Schema({    
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

const Chat = mongoose.model('Chat', ChatSchema);
module.exports = Chat;