import mongoose from 'mongoose';

export const certKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');

const certSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    empId: { type: String, required: true, index: true }, // denormalised for fast filtering/export
    specialization: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true },
    issuedOn: { type: Date, default: null },
    expiresOn: { type: Date, default: null, index: true },
    noExpiry: { type: Boolean, default: false },
    credentialUrl: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    credlyBadgeId: { type: String, trim: true },
    source: { type: String, enum: ['manual', 'credly', 'import'], default: 'manual' },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// One entry per person per certification (ignores case and punctuation differences).
certSchema.index({ user: 1, nameKey: 1 }, { unique: true });
certSchema.index({ user: 1, credlyBadgeId: 1 }, { unique: true, partialFilterExpression: { credlyBadgeId: { $type: 'string' } } });

certSchema.pre('validate', function () {
  if (this.name) this.nameKey = certKey(this.name);
  if (this.noExpiry) this.expiresOn = null;
});

export const Certification = mongoose.model('Certification', certSchema);
