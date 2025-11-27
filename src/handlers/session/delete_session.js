const Session = require('../../models/session')
const delete_session = async (req, res) => {
    try {
        const { sessionId } = req.params
        await Session.findByIdAndDelete(sessionId)
        res.status(200).json({ message: 'Session deleted successfully.' })
    }
    catch (err) {
        res.status(500).json({ message: 'Error deleting session', error: err.message });
    }
}
module.exports = delete_session