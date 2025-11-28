// models/session.js
const mongoose = require('mongoose');

const MediaUploadSchema = new mongoose.Schema(
  {
    fieldName: {
      type: String,
      default: null,
    },
    originalName: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
      index: true,
    },
    mimetype: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    // e.g. "uploads/sessions/abc123.wav"
    storagePath: {
      type: String,
      required: true,
    },
    // e.g. "/uploads/sessions/abc123.wav" — used by frontend
    url: {
      type: String,
      required: true,
    },
    // "audio" | "image" | "video" | "other"
    kind: {
      type: String,
      enum: ['audio', 'image', 'video', 'other'],
      default: 'other',
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

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

    // First AI summary from scan_website / upload_session
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

    
    scanned: {
      type: Boolean,
      default: false,
      index: true,
    },

    
    mediaUploads: {
      type: [MediaUploadSchema],
      default: [],
    },

    createdAt: {
      type: Date,
      default: Date.now,
      expires: '1h',
    },
  },
  {
    // we keep createdAt name stable, and get updatedAt automatically
    timestamps: { createdAt: 'createdAt', updatedAt: true },
  }
);

const Session = mongoose.model('Session', SessionSchema);
module.exports = Session;