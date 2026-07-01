const mongoose = require('mongoose');

// ─── Sub-schemas ─────────────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Review title cannot exceed 100 characters'],
    },
    body: {
      type: String,
      required: [true, 'Review text is required'],
      trim: true,
      minlength: [10, 'Review must be at least 10 characters'],
      maxlength: [2000, 'Review cannot exceed 2000 characters'],
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ─── Main Book Schema ─────────────────────────────────────────────────────────
const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Book title is required'],
      trim: true,
      maxlength: [300, 'Title cannot exceed 300 characters'],
    },
    authors: [
      {
        type: String,
        required: [true, 'At least one author is required'],
        trim: true,
      },
    ],
    isbn: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values (not all books have ISBNs)
      trim: true,
      match: [/^(?:\d{9}[\dX]|\d{13})$/, 'Please provide a valid ISBN-10 or ISBN-13'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    coverImage: {
      type: String,
      default: null,
    },
    genres: [
      {
        type: String,
        enum: [
          'Fiction', 'Non-Fiction', 'Mystery', 'Science Fiction', 'Fantasy',
          'Romance', 'Thriller', 'Biography', 'History', 'Self-Help',
          'Science', 'Technology', 'Poetry', 'Horror', 'Children',
          'Young Adult', 'Graphic Novel', 'Travel', 'Cooking', 'Art',
        ],
      },
    ],
    publishedYear: {
      type: Number,
      min: [868, 'Year seems too early'],
      max: [new Date().getFullYear() + 2, 'Year cannot be too far in the future'],
    },
    publisher: {
      type: String,
      trim: true,
      maxlength: [200, 'Publisher name cannot exceed 200 characters'],
    },
    pageCount: {
      type: Number,
      min: [1, 'Page count must be at least 1'],
    },
    language: {
      type: String,
      default: 'English',
      trim: true,
    },
    // External IDs for integration with Google Books API etc.
    externalIds: {
      googleBooksId: String,
      openLibraryId: String,
    },
    // Aggregated ratings data
    ratings: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
      distribution: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
    },
    reviews: [reviewSchema],
    // Who added this book to the platform
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tags: [
      {
        type: String,
        lowercase: true,
        trim: true,
        maxlength: 30,
      },
    ],
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: true, // Set to false if moderation queue is needed
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    saveCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
bookSchema.index({ title: 'text', authors: 'text', description: 'text', tags: 'text' });
bookSchema.index({ 'ratings.average': -1 });
bookSchema.index({ genres: 1 });
bookSchema.index({ publishedYear: -1 });
bookSchema.index({ createdAt: -1 });
bookSchema.index({ isFeatured: 1, 'ratings.average': -1 });

// ─── Virtual Fields ───────────────────────────────────────────────────────────
bookSchema.virtual('reviewCount').get(function () {
  return this.reviews?.length || 0;
});

// ─── Methods ──────────────────────────────────────────────────────────────────

// Recalculate average rating after reviews are added/edited/deleted
bookSchema.methods.recalculateRatings = function () {
  const reviews = this.reviews;

  if (!reviews || reviews.length === 0) {
    this.ratings = { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    return;
  }

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;

  reviews.forEach((review) => {
    distribution[review.rating]++;
    total += review.rating;
  });

  this.ratings = {
    average: parseFloat((total / reviews.length).toFixed(2)),
    count: reviews.length,
    distribution,
  };
};

// ─── Statics ──────────────────────────────────────────────────────────────────
bookSchema.statics.searchBooks = function (query, options = {}) {
  const {
    genres,
    minRating,
    maxYear,
    minYear,
    sortBy = 'relevance',
    page = 1,
    limit = 12,
  } = options;

  const filter = { isApproved: true };

  if (query) {
    filter.$text = { $search: query };
  }
  if (genres?.length) {
    filter.genres = { $in: genres };
  }
  if (minRating) {
    filter['ratings.average'] = { $gte: minRating };
  }
  if (minYear || maxYear) {
    filter.publishedYear = {};
    if (minYear) filter.publishedYear.$gte = minYear;
    if (maxYear) filter.publishedYear.$lte = maxYear;
  }

  const sortOptions = {
    relevance: query ? { score: { $meta: 'textScore' } } : { createdAt: -1 },
    newest: { createdAt: -1 },
    rating: { 'ratings.average': -1 },
    popular: { viewCount: -1 },
    title: { title: 1 },
  };

  const skip = (page - 1) * limit;

  return this.find(filter)
    .sort(sortOptions[sortBy] || sortOptions.newest)
    .skip(skip)
    .limit(limit)
    .populate('addedBy', 'username avatar')
    .select('-reviews');
};

const Book = mongoose.model('Book', bookSchema);

module.exports = Book;
