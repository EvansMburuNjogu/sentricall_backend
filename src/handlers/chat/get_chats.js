const Chat = require('../../models/chat')
const get_chats = async (req, res) => {
    try {
        const { userId } = req.user
        const chats = await Chat.find({userId}).sort({_id:-1})
        res.status(200).json({ message: 'Chat fetched successfully.', chats })
    }
    catch (err) {
        res.status(500).json({ message: 'Error getting chat', error: err.message });
    }
}
module.exports = get_chats