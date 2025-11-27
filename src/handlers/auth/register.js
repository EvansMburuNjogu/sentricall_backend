const User = require('../../models/user');
const bcrypt = require('bcryptjs');
const register_user = async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }
        const salt = await bcrypt.genSalt(10);
        const newPassword = await bcrypt.hash(password, salt);
        const newUser = new User({ firstName, lastName, email, password: newPassword });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully', userId: newUser._id });

    }
    catch (error) {
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
}
module.exports = register_user;
