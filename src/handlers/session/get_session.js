const Session = require('../../models/session')
const get_session = async (req, res) => {
    try {
        const { sessionId } = req.params
        const session = await Session.findById(sessionId)
        res.status(200).json({ message: 'Session deleted successfully.', session })
    }
    catch (err) {
        res.status(500).json({ message: 'Error getting session', error: err.message });
    }
}
module.exports = get_session