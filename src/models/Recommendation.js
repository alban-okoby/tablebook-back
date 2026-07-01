const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: [true, 'Book reference is required'],
    },
    recommendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recommender is required'],
    },
    // Targeted recommendation to a specific user (optional — null = public post)
    recommendedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Recommendation message cannot exceed 500 characters'],
    },
    // Why they recommend it
    reasonTags: [
      {
        type: String,
        enum: [
          'Great story', 'Educational', 'Easy read', 'Page-turner',
          'Life-changing', 'Thought-provoking', 'Well-written', 'Funny',
          'Emotional', 'Inspiring', 'Classic', 'Hidden gem',
        ],
      },
    ],
    visibility: {
      type: String,
      enum: ['public', 'followers', 'private'],
      default: 'public',
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: [300, 'Comment cannot exceed 300 characters'],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isRead: {
      // Whether the recipient has marked the recommendation as read
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
recommendationSchema.index({ recommendedBy: 1, createdAt: -1 });
recommendationSchema.index({ recommendedTo: 1, isRead: 1 });
recommendationSchema.index({ book: 1 });
recommendationSchema.index({ visibility: 1, createdAt: -1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────
recommendationSchema.virtual('likesCount').get(function () {
  return this.likes?.length || 0;
});

recommendationSchema.virtual('commentsCount').get(function () {
  return this.comments?.length || 0;
});

// ─── Statics ──────────────────────────────────────────────────────────────────
recommendationSchema.statics.getFeed = function (userId, followingIds, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  return this.find({
    $or: [
      // Public recommendations from followed users
      { recommendedBy: { $in: followingIds }, visibility: 'public' },
      // Own recommendations
      { recommendedBy: userId },
      // Received recommendations
      { recommendedTo: userId },
    ],
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('book', 'title authors coverImage ratings.average')
    .populate('recommendedBy', 'username avatar')
    .populate('recommendedTo', 'username avatar');
};

const Recommendation = mongoose.model('Recommendation', recommendationSchema);

module.exports = Recommendation;
