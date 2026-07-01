const mongoose = require('mongoose');
const crypto = require('crypto');

const bookingSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Restaurant is required'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    date: {
      type: Date,
      required: [true, 'Booking date is required'],
    },
    time: {
      type: String,
      required: [true, 'Booking time is required'],
      match: [/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'],
    },
    partySize: {
      type: Number,
      required: [true, 'Party size is required'],
      min: [1, 'Party size must be at least 1'],
      max: [50, 'Party size cannot exceed 50'],
    },
    tableLabel: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
      default: 'pending',
    },
    specialRequests: {
      type: String,
      trim: true,
      maxlength: [500, 'Special requests cannot exceed 500 characters'],
    },
    confirmationCode: {
      type: String,
      unique: true,
    },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, trim: true, maxlength: 300 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

bookingSchema.index({ restaurant: 1, date: 1, status: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ confirmationCode: 1 });
bookingSchema.index({ status: 1, date: 1 });

bookingSchema.pre('save', function (next) {
  if (!this.confirmationCode) {
    this.confirmationCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

bookingSchema.virtual('isPast').get(function () {
  return this.date < new Date();
});

bookingSchema.statics.findConflicts = function (restaurantId, date, time) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    restaurant: restaurantId,
    date: { $gte: startOfDay, $lte: endOfDay },
    time,
    status: { $in: ['pending', 'confirmed'] },
  });
};

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
