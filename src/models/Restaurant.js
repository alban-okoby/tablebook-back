const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100 },
    body: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isEdited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const tableSchema = new mongoose.Schema({
  label: { type: String, trim: true },
  capacity: { type: Number, required: true, min: 1, max: 20 },
  count: { type: Number, required: true, min: 1, default: 1 },
});

const openingHoursSchema = new mongoose.Schema({
  day: {
    type: String,
    required: true,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  },
  open: { type: String, match: /^\d{2}:\d{2}$/ },
  close: { type: String, match: /^\d{2}:\d{2}$/ },
  isClosed: { type: Boolean, default: false },
});

const restaurantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Restaurant name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [3000, 'Description cannot exceed 3000 characters'],
    },
    cuisine: [
      {
        type: String,
        enum: [
          'Italian', 'French', 'Japanese', 'Chinese', 'Indian', 'Mexican',
          'American', 'Mediterranean', 'Thai', 'Greek', 'Spanish', 'Lebanese',
          'Korean', 'Vietnamese', 'Turkish', 'Moroccan', 'Brazilian', 'Seafood',
          'Vegetarian', 'Vegan', 'Steakhouse', 'Fusion', 'Other',
        ],
      },
    ],
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true, required: [true, 'City is required'] },
      state: { type: String, trim: true },
      country: { type: String, trim: true, default: 'US' },
      zipCode: { type: String, trim: true },
    },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    website: { type: String, trim: true },
    images: [{ type: String }],
    coverImage: { type: String, default: null },
    priceRange: {
      type: String,
      enum: ['$', '$$', '$$$', '$$$$'],
      default: '$$',
    },
    tables: [tableSchema],
    openingHours: [openingHoursSchema],
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    reviews: [reviewSchema],
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isFeatured: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: true },
    viewCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

restaurantSchema.index({ name: 'text', description: 'text' });
restaurantSchema.index({ 'address.city': 1 });
restaurantSchema.index({ cuisine: 1 });
restaurantSchema.index({ 'ratings.average': -1 });
restaurantSchema.index({ isFeatured: 1, 'ratings.average': -1 });
restaurantSchema.index({ createdAt: -1 });

restaurantSchema.virtual('reviewCount').get(function () {
  return this.reviews?.length || 0;
});

restaurantSchema.virtual('totalCapacity').get(function () {
  return this.tables?.reduce((sum, t) => sum + t.capacity * t.count, 0) || 0;
});

restaurantSchema.methods.recalculateRatings = function () {
  const reviews = this.reviews;
  if (!reviews || reviews.length === 0) {
    this.ratings = { average: 0, count: 0 };
    return;
  }
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  this.ratings = {
    average: parseFloat((total / reviews.length).toFixed(2)),
    count: reviews.length,
  };
};

restaurantSchema.statics.search = function (query, options = {}) {
  const { cuisine, city, priceRange, minRating, sortBy = 'newest', page = 1, limit = 12 } = options;

  const filter = { isApproved: true };

  if (query) filter.$text = { $search: query };
  if (cuisine?.length) filter.cuisine = { $in: cuisine };
  if (city) filter['address.city'] = { $regex: city, $options: 'i' };
  if (priceRange) filter.priceRange = priceRange;
  if (minRating) filter['ratings.average'] = { $gte: minRating };

  const sortOptions = {
    relevance: query ? { score: { $meta: 'textScore' } } : { createdAt: -1 },
    newest: { createdAt: -1 },
    rating: { 'ratings.average': -1 },
    popular: { viewCount: -1 },
    name: { name: 1 },
  };

  return this.find(filter)
    .sort(sortOptions[sortBy] || sortOptions.newest)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('addedBy', 'username avatar')
    .select('-reviews');
};

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

module.exports = Restaurant;
