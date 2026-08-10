import mongoose from 'mongoose';

const AppErrorSchema = new mongoose.Schema({
  // Core identification
  errorId:       { type: String, required: true, unique: true },  // short hash for easy reference
  fingerprint:   { type: String, index: true },  // hash of route+message — for deduplication

  // Priority and classification
  priority:     { type: String, enum: ['critical','high','medium','low'], required: true, index: true },
  zone:         { type: String, enum: ['dating','adult','admin','unknown'], default: 'unknown' },
  category:     { type: String, enum: [
    'payment', 'auth', 'upload', 'database', 'socket',
    'email', 'push', 'third_party', 'validation', 'not_found',
    'rate_limit', 'permission', 'server', 'unknown',
  ], default: 'unknown' },

  // Request context — EXACTLY what the user sent
  request: {
    method:      String,   // GET, POST, PUT, DELETE
    route:       String,   // /api/v1/adult/wallet/tip
    params:      mongoose.Schema.Types.Mixed,   // { providerId: "abc123" }
    query:       mongoose.Schema.Types.Mixed,   // { page: "1", limit: "20" }
    body:        mongoose.Schema.Types.Mixed,   // sanitized — no passwords, no tokens
    headers:     mongoose.Schema.Types.Mixed,   // only useful ones (content-type, user-agent)
    ip:          String,
    userAgent:   String,
  },

  // Who caused it
  userId:        { type: mongoose.Schema.Types.ObjectId },
  accountType:   { type: String },   // 'member' | 'service_provider' | 'admin' | null

  // The error itself
  message:       { type: String, required: true },    // human-readable what went wrong
  stack:         { type: String, select: false },     // stack trace (admin-only, not in list view)
  statusCode:    { type: Number },
  errorCode:     { type: String },                    // e.g. 'INSUFFICIENT_CREDITS', 'NO_TONIGHT_RATE'

  // What the app was trying to do (if known)
  operation:     { type: String },   // e.g. 'tip_payment', 'image_upload', 'push_send'

  // Deduplication and frequency
  count:         { type: Number, default: 1 },        // how many times this exact error occurred
  firstSeenAt:   { type: Date, default: Date.now },
  lastSeenAt:    { type: Date, default: Date.now },

  // Status
  resolved:      { type: Boolean, default: false },
  resolvedAt:    { type: Date },
  resolvedBy:    { type: mongoose.Schema.Types.ObjectId },  // admin who resolved it
  resolutionNote: { type: String },

  // Auto-escalation
  escalated:     { type: Boolean, default: false },
  escalatedAt:   { type: Date },
  // If same error fires 10+ times in 1 hour → escalate to critical

  createdAt:     { type: Date, default: Date.now, index: true },
  updatedAt:     { type: Date, default: Date.now },
}, {
  collection: 'app_errors',
});

// Index for fast admin queries
AppErrorSchema.index({ priority: 1, resolved: 1, createdAt: -1 });
AppErrorSchema.index({ fingerprint: 1, createdAt: -1 });

export const AppError = mongoose.model('AppError', AppErrorSchema);
