const Chat = require('../../models/chat')
const create_chat = async (req, res) => {
    try {
        const { name, } = req.body
        const userId = req.user.userId
        const data = new Chat({
            name, userId
        })
        await data.save()
        res.status(200).json({ message: 'Chat created successfully.' })
    }
    catch (err) {
        res.status(500).json({ message: 'Error creating chat', error: err.message });
    }
}
module.exports = create_chat