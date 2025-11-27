const Conversation = require('../../models/conversation')
const get_session_conversations = async (req, res) => {
    try {
        const { sessionId } = req.params
        const conversations = await Conversation.find({ sessionId: sessionId })
        res.status(200).json({ message: 'Session conversations fetched successfully.', conversations })
    }
    catch (err) {
        res.status(500).json({ message: 'Error getting session conversations', error: err.message });
    }
}
module.exports = get_session_conversations