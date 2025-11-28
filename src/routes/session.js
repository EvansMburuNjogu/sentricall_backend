// src/routes/sessionRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');   
const authenticateJWT = require('../middleware/jwt');

const create_session = require('../handlers/session/create_session');
const delete_session = require('../handlers/session/delete_session');
const get_sessions = require('../handlers/session/get_sessions');
const get_session = require('../handlers/session/get_session');
const get_session_conversations = require('../handlers/session/get_session_conversations');
const scan_website = require('../handlers/session/scan_website');
const ask_session = require('../handlers/session/ask_session');
const upload_session = require('../handlers/session/upload_session');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'uploads', 'sessions'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, base.replace(/\s+/g, '_') + '-' + unique + ext);
  },
});

// only audio/* or image/* allowed
const fileFilter = (req, file, cb) => {
  const mime = file.mimetype || '';
  if (mime.startsWith('image/') || mime.startsWith('audio/')) {
    return cb(null, true);
  }
  return cb(new Error('Only images and audio files are allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 5,                 // max 5
    fileSize: 20 * 1024 * 1024, // 20MB per file (adjust if needed)
  },
});
router.use(authenticateJWT);


router.post('/create_session', create_session);
router.delete('/delete_session/:sessionId', delete_session);
router.get('/get_sessions', get_sessions);
router.get('/get_session/:sessionId', get_session);
router.get('/get_session_conversations/:sessionId', get_session_conversations);

router.post('/scan_website/:sessionId', scan_website);
router.post('/ask_session/:sessionId', ask_session);

router.post(
  '/upload_session/:sessionId',
  upload.array('files', 5),
  upload_session
);

module.exports = router;