const mongoose = require('mongoose');
const ReportSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullname: { type: String, required: true },
    phone: { type: String, required: false },
    email: { type: String, required: false },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    aiAnalysis: { type: String, required: false },
    createdAt: { type: Date, default: Date.now }
})
const Report = mongoose.model('Report', ReportSchema);
module.exports = Report;