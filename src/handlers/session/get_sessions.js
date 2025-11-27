const Session = require('../../models/session')
const get_sessions = async (req, res) => {
    try {
        const { userId } = req.user
        const sessions = await Session.find({ userId: userId })
        res.status(200).json({ message: 'Sessions fetched successfully.', sessions })
    }
    catch (err) {
        res.status(500).json({ message: 'Error fetching sessions', error: err.message });
    }
}
module.exports = get_sessions