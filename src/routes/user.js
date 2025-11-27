const express = require('express');
const router = express.Router();

const update_account_details = require('../handlers/user/update_account_details');
const authenticateJWT = require('../middleware/jwt');
const get_user_detail = require('../handlers/user/get_user_detail');

router.use(authenticateJWT);

router.put('/update', update_account_details);
router.get('/get_user',get_user_detail)
module.exports = router;