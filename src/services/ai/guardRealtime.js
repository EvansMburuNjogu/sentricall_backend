// src/services/ai/guardRealtime.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

/**
 * Analyse a single screen frame and return AI alerts.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {number} params.timestampMs
 * @param {string} params.imageBase64   // base64 (may or may not include data: prefix)
 * @param {string|null} params.userId
 *
 * @returns {Promise<{
 *   alerts: Array<{
 *     hasAlert: boolean,
 *     severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH',
 *     title: string,
 *     message: string
 *   }>
 * }>}
 */
async function analyzeRealtimeFrame({ sessionId, timestampMs, imageBase64, userId }) {
  if (!process.env.OPENAI_KEY) {
    console.warn('[guardRealtime] OPENAI_KEY not set – returning no alerts');
    return { alerts: [] };
  }

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return { alerts: [] };
  }

  // Clean any possible data: prefix (defensive, even though we expect raw base64)
  const cleanedBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

  // Build a data URL for image input to OpenAI
  const dataUrl = `data:image/jpeg;base64,${cleanedBase64}`;

  const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini';

  const systemPrompt = `
You are SentriCall Guard, an AI security watcher monitoring live mobile screen recordings.

Your job:
- Detect suspicious or risky flows in financial, login, authentication, or communication apps
- Especially focus on:
  - fake M-Pesa or mobile money prompts
  - suspicious payment pages
  - login screens that look like phishing
  - OTP interception, SIM-swap hints, or fraud warnings
- Be conservative but helpful: raise alerts when something looks clearly risky, or when there are strong warning signs.

Output STRICTLY JSON with the following shape:

{
  "alerts": [
    {
      "hasAlert": boolean,
      "severity": "INFO" | "LOW" | "MEDIUM" | "HIGH",
      "title": string,
      "message": string
    }
  ]
}

Rules:
- If there is nothing clearly risky, return an empty alerts array: { "alerts": [] }.
- "severity" should be HIGH only when there is a strong signal of fraud or major risk.
- Use "INFO" for purely informational notices / gentle guidance.
  `.trim();

  const userContext = `
Session ID: ${sessionId}
User ID: ${userId || 'anonymous'}
Timestamp (ms): ${timestampMs}

Look at this single frame as if it is part of a live screen recording.
If you see anything that could be risky or fraudulent, raise an alert.
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userContext,
            },
            {
              type: 'input_image',
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.warn('[guardRealtime] Failed to parse AI JSON:', parseErr);
      parsed = {};
    }

    const alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];

    // Final normalization / safety
    const normalized = alerts.map((a) => ({
      hasAlert: Boolean(a.hasAlert),
      severity: ['INFO', 'LOW', 'MEDIUM', 'HIGH'].includes(a.severity)
        ? a.severity
        : 'INFO',
      title: typeof a.title === 'string' && a.title.trim()
        ? a.title.trim()
        : 'AI alert',
      message: typeof a.message === 'string' && a.message.trim()
        ? a.message.trim()
        : 'The AI detected something potentially important on this screen.',
    }));

    return { alerts: normalized };
  } catch (err) {
    console.error('[guardRealtime] OpenAI error:', err);
    // On failure, fail safe: no alerts instead of breaking client
    return { alerts: [] };
  }
}

module.exports = analyzeRealtimeFrame;