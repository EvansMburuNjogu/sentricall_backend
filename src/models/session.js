// models/session.js
const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema(
  {
    // Owner
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Display name shown in the app
    name: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * Session type – these MUST match what the frontend sends:
     *  listen_audio, upload_media, website_link, screen_record
     */
    type: {
      type: String,
      required: true,
      enum: ['listen_audio', 'upload_media', 'website_link', 'record_screen'],
      index: true,
    },

    // Website-specific fields (optional for other session types)
    websiteUrl: {
      type: String,
      default: null,
    },

    // First AI summary from scan_website
    initialScanSummary: {
      type: String,
      default: null,
    },

    /**
     * Initial risk level from the first scan.
     * We keep everything UPPERCASE for consistency.
     */
    initialScanRiskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'],
      default: 'UNKNOWN',
    },

    // TTL – session auto-expires after 1 hour
    createdAt: {
      type: Date,
      default: Date.now,
      expires: '1h',
    },
  },
  {
    // if you ever need updatedAt later
    timestamps: { createdAt: 'createdAt', updatedAt: true },
  }
);

const Session = mongoose.model('Session', SessionSchema);
module.exports = Session;