const mongoose = require('mongoose');
const SessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  type:{type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '1h' }, 
})
const Session = mongoose.model('Session', SessionSchema);
module.exports = Session;