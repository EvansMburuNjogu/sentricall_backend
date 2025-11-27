const Report = require('../../models/report')
const get_reports = async (req, res) => {
    try {
        const reports = await Report.find({});
        res.status(200).json(reports);
    }
    catch (err) {
        res.status(500).json({ message: 'Error retrieving reports', error: err.message });
    }
}
module.exports = get_reports