import mongoose from 'mongoose'

const plotSchema = new mongoose.Schema({
  id: { type: String, required: true },
  category: { type: String, required: true },
  size: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['available', 'reserved', 'taken'], default: 'available' },
  exhibitorsCapacity: { type: Number, required: true, min: 1 },
  traffic: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  offsetN: { type: Number, default: 0 },
  offsetE: { type: Number, default: 0 }
}, { _id: false })

const showgroundSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  county: { type: String, required: true },
  name: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  whatsappNumber: { type: String, trim: true, maxlength: 20 },
  season: {
    startMonth: { type: Number, min: 1, max: 12 },
    endMonth: { type: Number, min: 1, max: 12 }
  },
  plots: { type: [plotSchema], default: [] }
}, { timestamps: true, versionKey: false })

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  sessionToken: { type: String, index: true },
  status: { type: String, enum: ['pending', 'verified', 'consumed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true })

const bookingSchema = new mongoose.Schema({
  showgroundId: { type: String, required: true, index: true },
  plotId: { type: String, required: true },
  exhibitorName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, index: true },
  exhibitorCount: { type: Number, required: true, min: 1 },
  powerNeed: { type: String, enum: ['none', 'single', 'three'], default: 'none' },
  signageText: { type: String, trim: true, maxlength: 160 },
  setupDate: { type: String },
  competitionOptIn: { type: Boolean, default: false },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['reserved', 'pending_payment', 'confirmed', 'failed', 'expired', 'cancelled'], default: 'reserved', index: true },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
  approvalNote: { type: String, trim: true, maxlength: 500 },
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  permitRef: { type: String, unique: true, sparse: true },
  expiresAt: { type: Date, index: true },
  lastPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }
}, { timestamps: true, versionKey: false })
bookingSchema.index({ showgroundId: 1, plotId: 1, status: 1 })

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true, index: true },
  phone: { type: String, required: true },
  amount: { type: Number, required: true },
  provider: { type: String, enum: ['demo', 'daraja'], required: true },
  status: { type: String, enum: ['initiated', 'pending', 'success', 'failed'], default: 'initiated' },
  merchantRequestId: String,
  checkoutRequestId: { type: String, index: true },
  mpesaReceiptNumber: String,
  resultCode: String,
  resultDescription: String,
  rawCallback: mongoose.Schema.Types.Mixed
}, { timestamps: true, versionKey: false })

const inquirySchema = new mongoose.Schema({
  showgroundId: { type: String, required: true },
  plotId: { type: String, required: true },
  phone: { type: String, required: true },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['new', 'replied', 'closed'], default: 'new' }
}, { timestamps: true, versionKey: false })

const adminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'gate'], default: 'admin' },
  showgroundIds: { type: [String], default: [] },
  active: { type: Boolean, default: true }
}, { timestamps: true, versionKey: false })

const adminSessionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true, versionKey: false })

const passwordResetSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true, versionKey: false })

const siteSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'primary' },
  siteName: { type: String, default: 'County Showgrounds', trim: true, maxlength: 120 },
  logoUrl: { type: String, default: '/county-showgrounds-logo.png', maxlength: 700000 },
  supportPhone: { type: String, default: '', trim: true, maxlength: 30 },
  themeColors: {
    primary: { type: String, default: '#2b4034', match: /^#[0-9a-fA-F]{6}$/ },
    accent: { type: String, default: '#4c7a5d', match: /^#[0-9a-fA-F]{6}$/ },
    background: { type: String, default: '#f2f4ee', match: /^#[0-9a-fA-F]{6}$/ },
    surface: { type: String, default: '#ffffff', match: /^#[0-9a-fA-F]{6}$/ },
    text: { type: String, default: '#232a22', match: /^#[0-9a-fA-F]{6}$/ }
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
}, { timestamps: true, versionKey: false })

const visitorSchema = new mongoose.Schema({
  showgroundId: { type: String, index: true },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 20 },
  permitRef: { type: String, trim: true, index: true },
  visitDate: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'checked_in', 'checked_out'], default: 'pending', index: true },
  note: { type: String, trim: true, maxlength: 500 },
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  lastScannedAt: Date,
  scanEvents: [{
    action: { type: String, enum: ['check_in', 'check_out'] },
    scannedAt: { type: Date, default: Date.now },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
  }]
}, { timestamps: true, versionKey: false })

export const Showground = mongoose.model('Showground', showgroundSchema)
export const Otp = mongoose.model('Otp', otpSchema)
export const Booking = mongoose.model('Booking', bookingSchema)
export const Payment = mongoose.model('Payment', paymentSchema)
export const Inquiry = mongoose.model('Inquiry', inquirySchema)
export const AdminUser = mongoose.model('AdminUser', adminUserSchema)
export const AdminSession = mongoose.model('AdminSession', adminSessionSchema)
export const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema)
export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema)
export const Visitor = mongoose.model('Visitor', visitorSchema)
