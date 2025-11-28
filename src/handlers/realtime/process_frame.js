// src/handlers/realtime/process_frame.js
const analyzeRealtimeFrame = require('../../services/ai/guardRealtime');

/**
 * POST /api/v1/realtime/frame
 *
 * Expected body:
 * {
 *   "sessionId": "abc123",
 *   "timestampMs": 1700000000000,
 *   "imageBase64": "...."   // base64, may or may not include data: prefix
 * }
 *
 * Auth:
 * - Uses authenticateJWT middleware, so req.user should be populated.
 */
async function process_frame(req, res) {
  try {
    const { sessionId, timestampMs, imageBase64 } = req.body || {};
    const userId = req.user?.id || req.user?._id || null;

    // Basic validation
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        ok: false,
        message: 'sessionId is required and must be a string',
      });
    }

    if (typeof timestampMs !== 'number') {
      return res.status(400).json({
        ok: false,
        message: 'timestampMs is required and must be a number (ms since epoch)',
      });
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({
        ok: false,
        message: 'imageBase64 is required and must be a base64 string',
      });
    }

    // Call AI service
    const { alerts } = await analyzeRealtimeFrame({
      sessionId,
      timestampMs,
      imageBase64,
      userId,
    });

    return res.json({
      ok: true,
      sessionId,
      timestampMs,
      alerts: alerts || [],
    });
  } catch (err) {
    console.error('[realtime/process_frame] Error:', err);

    return res.status(500).json({
      ok: false,
      message: 'Failed to process frame',
    });
  }
}

module.exports = process_frame;