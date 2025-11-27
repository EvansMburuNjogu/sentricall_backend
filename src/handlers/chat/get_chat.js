const Chat = require('../../models/chat')
const get_chat = async (req, res) => {
    try {
        const { chatId } = req.params
        const chat = await Chat.findById(chatId)
        res.status(200).json({ message: 'Chats deleted successfully.', chat })
    }
    catch (err) {
        res.status(500).json({ message: 'Error getting chats', error: err.message });
    }
}
module.exports = get_chat