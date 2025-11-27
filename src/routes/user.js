const express = require('express');
const router = express.Router();

const update_account_details = require('../handlers/user/update_account_details');
const authenticateJWT = require('../middleware/jwt');

router.use(authenticateJWT);

router.put('/update', update_account_details);
module.exports = router;