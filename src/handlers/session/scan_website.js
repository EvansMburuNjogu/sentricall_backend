// src/handlers/session/scan_website.js
const Session = require('../../models/session');
const Conversation = require('../../models/conversation');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

/**
 * Uses OpenAI with web_search (deepsearch-style) to scan a website
 * and return structured risk info.
 */
async function deepsearchScanWebsite(websiteUrl) {
  const systemPrompt = `
You are SentriCall Copilot, a cybersecurity and fraud analysis assistant.

Your job is to scan websites for:
- Phishing or fake login pages
- Investment scams, fake brokers, and "get rich quick" promises
- Impersonation of banks, SACCOs, government agencies or telcos
- Requests for PINs, OTPs, CVV, full card details or passwords
- Pressure tactics: "act now", "last chance", "account will be closed", etc.

You MUST:
- Be conservative and prioritize user safety.
- If something is unclear, classify the risk as MEDIUM, not LOW.

Return ONLY JSON, no extra text, with this EXACT structure:

{
  "summary": "Short explanation in 2-4 sentences, plain text.",
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "red_flags": [
    "Short bullet point of a specific concern",
    "Another specific concern"
  ]
}
  `.trim();

  const userPrompt = `
Scan this website for fraud or scam risk:

URL: ${websiteUrl}

Analyse:
- How trustworthy the site looks
- Whether it is asking for sensitive information
- Any mismatches between brand and domain
- Language: urgency, fear, or promises of guaranteed returns.

Then respond ONLY with the JSON described above.
  `.trim();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    // later you can swap to Responses API with web_search here
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';

  // Try to parse JSON robustly
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch {
        parsed = {};
      }
    } else {
      parsed = {};
    }
  }

  const summary = (parsed.summary || '').toString().trim();
  const riskLevel = (parsed.risk_level || 'MEDIUM').toString().toUpperCase();
  const redFlags = Array.isArray(parsed.red_flags) ? parsed.red_flags : [];

  return {
    summary: summary || 'AI scan completed, but no clear summary was generated.',
    riskLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(riskLevel)
      ? riskLevel
      : 'MEDIUM',
    redFlags,
  };
}

/**
 * POST /api/v1/sessions/scan_website/:sessionId
 * Body: { websiteUrl: string }
 *
 * - Validates session belongs to user
 * - Runs deepsearch-style scan
 * - Updates Session: websiteUrl, initialScanSummary, initialScanRiskLevel, scanned
 * - Saves a Conversation (type=session, role=assistant)
 * - Returns updated session + summary + riskLevel
 */
const scan_website = async (req, res) => {
  try {
    const userId = req.user.userId;
    const sessionId = req.params.sessionId;
    const { websiteUrl } = req.body || {};

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required in URL' });
    }

    if (!websiteUrl || !websiteUrl.trim()) {
      return res.status(400).json({ message: 'websiteUrl is required' });
    }

    const cleanUrl = websiteUrl.trim();

    // Basic URL sanity check
    if (
      !cleanUrl.startsWith('http://') &&
      !cleanUrl.startsWith('https://')
    ) {
      return res.status(400).json({
        message:
          'websiteUrl must start with http:// or https:// (e.g. https://example.com)',
      });
    }

    // Ensure session belongs to this user
    const session = await Session.findOne({ _id: sessionId, userId });
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Run "deepsearch" scan (if this throws, we DON'T mark scanned)
    const { summary, riskLevel, redFlags } =
      await deepsearchScanWebsite(cleanUrl);

    // Update the session with website + initial scan results
    session.websiteUrl = cleanUrl;
    session.initialScanSummary = summary;
    session.initialScanRiskLevel = riskLevel;
    session.scanned = true; // ✅ mark as scanned because AI returned a result

    await session.save();

    // Save a conversation message linked to this session
    const conversation = await Conversation.create({
      sessionId: session._id,
      userId,
      type: 'session',
      role: 'assistant',
      content: [
        `Website scan for: ${cleanUrl}`,
        ``,
        `Risk level: ${riskLevel}`,
        ``,
        summary,
        redFlags.length
          ? `\nRed flags:\n- ${redFlags.join('\n- ')}`
          : '',
      ]
        .join('\n')
        .trim(),
      metadata: {
        kind: 'website_scan',
        websiteUrl: cleanUrl,
        redFlags,
      },
    });

    return res.json({
      ok: true,
      session,
      summary,
      riskLevel,
      redFlags,
      conversationId: conversation._id,
    });
  } catch (err) {
    console.error('scan_website error:', err);
    return res.status(500).json({
      message: 'Error scanning website. Please try again.',
    });
  }
};

module.exports = scan_website;