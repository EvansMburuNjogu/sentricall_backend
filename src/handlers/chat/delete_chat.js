const Chat = require('../../models/chat')
const delete_chat = async (req, res) => {
    try {
        const { chatId } = req.params
        await Chat.findByIdAndDelete(chatId)
        res.status(200).json({ message: 'Chat deleted successfully.' })
    }
    catch (err) {
        res.status(500).json({ message: 'Error deleting chat', error: err.message });
    }
}
module.exports = delete_chat