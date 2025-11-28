// src/routes/realtimeRoutes.js
const express = require('express');
const authenticateJWT = require('../middleware/jwt');

const process_frame = require('../handlers/realtime/process_frame');

const router = express.Router();

// All realtime endpoints require auth, just like sessions
router.use(authenticateJWT);


router.post('/frame', process_frame);

module.exports = router;