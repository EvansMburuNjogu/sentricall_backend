const express = require('express');
const register_user = require('../handlers/auth/register');
const login = require('../handlers/auth/login');
const router = express.Router();

router.post('/register', register_user);
router.post('/login', login)


module.exports = router;