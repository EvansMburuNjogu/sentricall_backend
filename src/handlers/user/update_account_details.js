const bcrypt = require('bcryptjs');
const User = require('../../models/user');
const update_account_details = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { firstName, lastName, email, existingPassword, newPassword } = req.body;
        const updatedData = {};
        if (firstName) updatedData.firstName = firstName;
        if (lastName) updatedData.lastName = lastName;
        if (email) updatedData.email = email;
        if (existingPassword && newPassword) {
            const user = await User.findById(userId);
            const isMatch = await bcrypt.compare(existingPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Existing password is incorrect' });
            }
            const salt = await bcrypt.genSalt(10);
            const hashedNewPassword = await bcrypt.hash(newPassword, salt);
            updatedData.password = hashedNewPassword;
        }
        const updatedUser = await User.findByIdAndUpdate(userId, updatedData, { new: true });
        res.status(200).json({ message: 'Account details updated successfully', user: updatedUser });
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating account details', error: error.message });
    }
}
module.exports = update_account_details;