const Report = require('../../models/report');
const create_report = async (req, res) => {
    try {
        const { fullname, phone, email, subject, message } = req.body;
        const userId = req.user.userId;
        const newReport = new Report({ userId, fullname, phone, email, subject, message });
        await newReport.save();
        res.status(201).json({ message: 'Report created successfully', reportId: newReport._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating report', error: error.message });
    }
}
module.exports = create_report;