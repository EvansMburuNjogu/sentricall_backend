// handlers/session/create_session.js
const Session = require('../../models/session');

const VALID_SESSION_TYPES = [
  'listen_audio',
  'upload_media',
  'website_link',
  'record_screen',
];


const create_session = async (req, res) => {
  try {
    const { userId } = req.user;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const body = req.body || {};
    let { name, type } = body;

    // 🔍 Log once while developing – helps debug
    console.log('create_session body:', body);

    // Name fallback
    if (!name || !name.trim()) {
      name = 'Guard session';
    } else {
      name = name.trim();
    }

    // Normalize type to lowercase
    if (typeof type === 'string') {
      type = type.trim().toLowerCase();
    }

    // Validate type
    if (!type || !VALID_SESSION_TYPES.includes(type)) {
      return res.status(400).json({
        message: 'Invalid session type',
        allowedTypes: VALID_SESSION_TYPES,
      });
    }

    const session = await Session.create({
      userId,
      name,
      type,                 // one of the 4 enums
      websiteUrl: null,     // filled after scan for website_link
      initialScanSummary: null,
      initialScanRiskLevel: 'unknown',
    });

    return res.status(201).json({
      message: 'Session created successfully',
      session,
    });
  } catch (err) {
    console.error('create_session error:', err);
    return res.status(500).json({
      message: 'Error creating session',
      error: err.message,
    });
  }
};

module.exports = create_session;