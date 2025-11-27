const express = require('express');
const authenticateJWT = require('../middleware/jwt');
const create_report = require('../handlers/report/create_report');
const get_reports = require('../handlers/report/get_reports');
const router = express.Router();

router.use(authenticateJWT)

router.post('/create_report', create_report)
router.get('/get_reports', get_reports)

module.exports = router