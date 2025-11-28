// handlers/session/upload_session.js
const path = require('path');
const Session = require('../../models/session');
const Conversation = require('../../models/conversation');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

function detectKind(mimetype = '') {
  if (!mimetype) return 'other';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'other';
}

const upload_session = async (req, res) => {
  try {
    // 🔐 Flexible userId from jwt middleware
    const userId =
      (req.user && (req.user.id || req.user._id || req.user.userId)) || null;

    if (!userId) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, message: 'sessionId is required' });
    }

    // Multer: can be req.files (array) or req.file (single)
    let files = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      files = req.files;
    } else if (req.file) {
      files = [req.file];
    }

    if (!files.length) {
      return res
        .status(400)
        .json({ ok: false, message: 'No files uploaded' });
    }

    // ✅ Ensure session belongs to this user
    const session = await Session.findOne({ _id: sessionId, userId });
    if (!session) {
      return res.status(404).json({ ok: false, message: 'Session not found' });
    }

    // ------------------------------------------------------
    // 1) Build mediaUploads entries from files
    // ------------------------------------------------------
    const uploadedMedia = files.map((file) => {
      const storagePath = file.path.replace(/\\/g, '/'); // normalize for Windows

      let url = storagePath;
      if (!url.startsWith('/')) {
        url = '/' + url;
      }

      return {
        fieldName: file.fieldname || null,
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        storagePath, // e.g. "uploads/sessions/abc123.wav"
        url, // e.g. "/uploads/sessions/abc123.wav"
        kind: detectKind(file.mimetype),
        uploadedAt: new Date(),
      };
    });

    // Append to any existing mediaUploads
    session.mediaUploads = session.mediaUploads.concat(uploadedMedia);

    // ------------------------------------------------------
    // 2) If session already scanned for upload_media:
    //    - just save new files & reuse existing summary/risk
    //    - no new AI call
    // ------------------------------------------------------
    if (session.scanned && session.type === 'upload_media') {
      await session.save();

      return res.status(200).json({
        ok: true,
        alreadyScanned: true,
        scanOk: true,
        sessionId: session._id,
        mediaUploads: session.mediaUploads,
        summary: session.initialScanSummary,
        riskLevel: session.initialScanRiskLevel,
      });
    }

    // ------------------------------------------------------
    // 3) Prepare simple description for AI analysis
    //    (metadata only – no actual audio/video/image content)
    // ------------------------------------------------------
    const descriptionLines = uploadedMedia.map((m, idx) => {
      const sizeKB = Math.round(m.size / 1024);
      return `File ${idx + 1}: "${m.originalName}" (${m.kind}, ${m.mimetype}, ~${sizeKB} KB)`;
    });

    const combinedDescription = descriptionLines.join('\n');

    let summaryText =
      'Your media has been uploaded successfully. SentriCall Copilot will help you review any suspicious content linked to these files.';
    let riskLevel = session.initialScanRiskLevel || 'UNKNOWN'; // default fallback
    // Embedding kept as placeholder (not used now, to avoid extra quota)
    const embedding = [];
    let aiScanOk = false;

    // ------------------------------------------------------
    // 4) Call OpenAI to get summary + risk level (metadata-based)
    //    Uses OPENAI_CHAT_MODEL, strict JSON output
    // ------------------------------------------------------
    const hasOpenAIKey = Boolean(process.env.OPENAI_KEY);
    const chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini';

    if (!hasOpenAIKey) {
      console.warn(
        '[upload_session] OPENAI_KEY not set – skipping AI scan, keeping defaults'
      );
    } else {
      try {
        const systemPrompt = `
You are SentriCall Copilot, an AI safety assistant.
You help users understand and avoid scams, fraud and social engineering.

You are only seeing metadata about uploaded media (file type, size, etc.), NOT the actual content.
Based on this metadata, you:
- Give a short, friendly summary of what the user has uploaded.
- Estimate a risk level (LOW, MEDIUM, HIGH, UNKNOWN) for potential fraud/scam risk.
If you are not sure, use "UNKNOWN".

Return ONLY valid JSON with:
{
  "summary": "short explanation to the user...",
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN"
}
`.trim();

        const userPrompt = `
Analyze the following uploaded media metadata and respond ONLY with JSON:

${combinedDescription}
`.trim();

        const completion = await openai.chat.completions.create({
          model: chatModel,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });

        const raw = completion?.choices?.[0]?.message?.content || '{}';

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (jsonErr) {
          console.error(
            '[upload_session] Failed to parse JSON from Copilot:',
            raw
          );
          parsed = {};
        }

        if (parsed && typeof parsed.summary === 'string') {
          const trimmed = parsed.summary.trim();
          if (trimmed) summaryText = trimmed;
        }

        if (
          parsed &&
          typeof parsed.riskLevel === 'string' &&
          ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'].includes(
            parsed.riskLevel.toUpperCase()
          )
        ) {
          riskLevel = parsed.riskLevel.toUpperCase();
        }

        aiScanOk = true; // ✅ AI call succeeded
      } catch (aiErr) {
        console.error('[upload_session] OpenAI summary error', aiErr);
        // AI failed (429 / quota / network) – keep defaults, aiScanOk = false
      }
    }

    // ------------------------------------------------------
    // 5) Persist updated session (summary + risk + scanned flag)
    // ------------------------------------------------------
    if (session.type === 'upload_media') {
      session.initialScanSummary = summaryText;
      session.initialScanRiskLevel = riskLevel;
      session.scanned = aiScanOk; // true only when AI succeeded
    }

    await session.save();

    // ------------------------------------------------------
    // 6) Save an assistant Conversation for this upload
    // ------------------------------------------------------
    const assistantConversation = await Conversation.create({
      sessionId: session._id,
      userId,
      type: 'session',
      role: 'assistant',
      content: summaryText,
      embedding, // currently []
      metadata: {
        source: 'uploaded_media',
        riskLevel,
        files: uploadedMedia.map((m) => ({
          originalName: m.originalName,
          filename: m.filename,
          url: m.url,
          mimetype: m.mimetype,
          kind: m.kind,
          size: m.size,
        })),
      },
    });

    return res.status(200).json({
      ok: true,
      alreadyScanned: false,
      scanOk: aiScanOk,
      sessionId: session._id,
      mediaUploads: session.mediaUploads,
      summary: summaryText,
      riskLevel,
      assistantConversation,
      message: aiScanOk
        ? 'Scan completed.'
        : 'Files uploaded, but AI scan failed. Please try again.',
    });
  } catch (err) {
    console.error('upload_session error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error handling media upload for this session.',
    });
  }
};

module.exports = upload_session;