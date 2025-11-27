const express = require('express');
const authenticateJWT = require('../middleware/jwt');
const create_session = require('../handlers/session/create_session');
const delete_session = require('../handlers/session/delete_session');
const get_sessions = require('../handlers/session/get_sessions');
const get_session = require('../handlers/session/get_session');
const get_session_conversations = require('../handlers/session/get_session_conversations');
const scan_website = require('../handlers/session/scan_website');
const router = express();

router.use(authenticateJWT)

router.post('/create_session',create_session)
router.delete('/delete_session/:sessionId',delete_session)
router.get('/get_sessions',get_sessions)
router.get('/get_session/:sessionId',get_session)
router.get('/get_session_conversations/:sessionId',get_session_conversations)
router.post('/scan_website/:sessionId', scan_website);
module.exports = router;