const Conversation = require('../../models/conversation')
const get_chat_conversations = async (req, res) => {
    try {
        const { chatId } = req.params
        const conversations = await Conversation.find({ chatId: chatId })
        res.status(200).json({ message: 'Chat conversations fetched successfully.', conversations })
    }
    catch (err) {
        res.status(500).json({ message: 'Error getting chat conversations', error: err.message });
    }
}
module.exports = get_chat_conversations