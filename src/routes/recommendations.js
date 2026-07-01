const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Recommendation = require('../models/Recommendation');
const Book = require('../models/Book');
const User = require('../models/User');
const { protect, optionalAuth } = require('../middleware/auth.middleware');

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errors.array() });
    return false;
  }
  return true;
};

const VALID_REASON_TAGS = [
  'Great story', 'Educational', 'Easy read', 'Page-turner',
  'Life-changing', 'Thought-provoking', 'Well-written', 'Funny',
  'Emotional', 'Inspiring', 'Classic', 'Hidden gem',
];

// ─── GET /api/recommendations/feed ───────────────────────────────────────────
// Personalized feed for logged-in user
router.get('/feed', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const user = await User.findById(req.user._id).select('following');
    const feed = await Recommendation.getFeed(req.user._id, user.following, page, limit);
    const total = await Recommendation.countDocuments({
      $or: [
        { recommendedBy: { $in: user.following }, visibility: 'public' },
        { recommendedBy: req.user._id },
        { recommendedTo: req.user._id },
      ],
    });

    res.json({
      recommendations: feed,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/recommendations/public ─────────────────────────────────────────
// Public discovery feed (no auth required)
router.get('/public', optionalAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const [recommendations, total] = await Promise.all([
      Recommendation.find({ visibility: 'public' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('book', 'title authors coverImage ratings.average genres')
        .populate('recommendedBy', 'username avatar')
        .populate('recommendedTo', 'username avatar'),
      Recommendation.countDocuments({ visibility: 'public' }),
    ]);

    res.json({
      recommendations,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/recommendations/inbox ──────────────────────────────────────────
// Recommendations sent directly to the logged-in user
router.get('/inbox', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unread === 'true';

    const filter = { recommendedTo: req.user._id };
    if (unreadOnly) filter.isRead = false;

    const [recommendations, total, unreadCount] = await Promise.all([
      Recommendation.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('book', 'title authors coverImage ratings.average')
        .populate('recommendedBy', 'username avatar'),
      Recommendation.countDocuments(filter),
      Recommendation.countDocuments({ recommendedTo: req.user._id, isRead: false }),
    ]);

    res.json({
      recommendations,
      unreadCount,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/recommendations/:id ────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const rec = await Recommendation.findById(req.params.id)
      .populate('book', 'title authors coverImage ratings.average description genres')
      .populate('recommendedBy', 'username avatar bio')
      .populate('recommendedTo', 'username avatar')
      .populate('comments.user', 'username avatar');

    if (!rec) return res.status(404).json({ error: 'Recommendation not found.' });

    // Visibility check
    if (rec.visibility === 'private') {
      const userId = req.user?._id?.toString();
      const isOwner = rec.recommendedBy._id.toString() === userId;
      const isRecipient = rec.recommendedTo?._id?.toString() === userId;
      if (!isOwner && !isRecipient) {
        return res.status(403).json({ error: 'This recommendation is private.' });
      }
    }

    // Mark as read if recipient is viewing
    if (req.user && rec.recommendedTo?.equals(req.user._id) && !rec.isRead) {
      rec.isRead = true;
      await rec.save();
    }

    res.json({ recommendation: rec });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/recommendations ────────────────────────────────────────────────
router.post(
  '/',
  protect,
  [
    body('bookId').isMongoId().withMessage('Valid book ID is required'),
    body('message').optional().trim().isLength({ max: 500 }),
    body('reasonTags')
      .optional()
      .isArray()
      .custom((tags) => tags.every((t) => VALID_REASON_TAGS.includes(t)))
      .withMessage('Invalid reason tag'),
    body('visibility')
      .optional()
      .isIn(['public', 'followers', 'private'])
      .withMessage('Visibility must be public, followers, or private'),
    body('recommendedTo').optional().isMongoId().withMessage('Invalid recipient user ID'),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const { bookId, message, reasonTags, visibility, recommendedTo } = req.body;

      // Verify book exists
      const book = await Book.findById(bookId).select('_id title');
      if (!book) return res.status(404).json({ error: 'Book not found.' });

      // Verify recipient exists (if provided)
      if (recommendedTo) {
        const recipient = await User.findById(recommendedTo).select('_id');
        if (!recipient) return res.status(404).json({ error: 'Recipient user not found.' });
        if (recommendedTo === req.user._id.toString()) {
          return res.status(400).json({ error: 'Cannot recommend a book to yourself.' });
        }
      }

      const rec = await Recommendation.create({
        book: bookId,
        recommendedBy: req.user._id,
        recommendedTo: recommendedTo || null,
        message,
        reasonTags: reasonTags || [],
        visibility: visibility || 'public',
      });

      await rec.populate([
        { path: 'book', select: 'title authors coverImage ratings.average' },
        { path: 'recommendedBy', select: 'username avatar' },
        { path: 'recommendedTo', select: 'username avatar' },
      ]);

      res.status(201).json({ recommendation: rec });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/recommendations/:id ──────────────────────────────────────────
router.patch(
  '/:id',
  protect,
  [
    body('message').optional().trim().isLength({ max: 500 }),
    body('reasonTags').optional().isArray(),
    body('visibility').optional().isIn(['public', 'followers', 'private']),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const rec = await Recommendation.findById(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Recommendation not found.' });

      if (!rec.recommendedBy.equals(req.user._id)) {
        return res.status(403).json({ error: 'Not authorized to edit this recommendation.' });
      }

      const { message, reasonTags, visibility } = req.body;
      if (message !== undefined) rec.message = message;
      if (reasonTags !== undefined) rec.reasonTags = reasonTags;
      if (visibility !== undefined) rec.visibility = visibility;

      await rec.save();
      res.json({ recommendation: rec });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/recommendations/:id ─────────────────────────────────────────
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const rec = await Recommendation.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found.' });

    const isOwner = rec.recommendedBy.equals(req.user._id);
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this recommendation.' });
    }

    await rec.deleteOne();
    res.json({ message: 'Recommendation deleted.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/recommendations/:id/like ──────────────────────────────────────
router.post('/:id/like', protect, async (req, res, next) => {
  try {
    const rec = await Recommendation.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found.' });

    const userId = req.user._id;
    const likedIdx = rec.likes.findIndex((id) => id.equals(userId));

    if (likedIdx === -1) {
      rec.likes.push(userId);
    } else {
      rec.likes.splice(likedIdx, 1);
    }

    await rec.save();
    res.json({ liked: likedIdx === -1, likesCount: rec.likes.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/recommendations/:id/comments ───────────────────────────────────
router.post(
  '/:id/comments',
  protect,
  [
    body('text')
      .trim()
      .isLength({ min: 1, max: 300 })
      .withMessage('Comment must be 1–300 characters'),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const rec = await Recommendation.findById(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Recommendation not found.' });

      rec.comments.push({ user: req.user._id, text: req.body.text });
      await rec.save();
      await rec.populate('comments.user', 'username avatar');

      const newComment = rec.comments[rec.comments.length - 1];
      res.status(201).json({ comment: newComment });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/recommendations/:id/comments/:commentId ─────────────────────
router.delete('/:id/comments/:commentId', protect, async (req, res, next) => {
  try {
    const rec = await Recommendation.findById(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found.' });

    const comment = rec.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    const isOwner = comment.user.equals(req.user._id);
    const isRecOwner = rec.recommendedBy.equals(req.user._id);
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);

    if (!isOwner && !isRecOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this comment.' });
    }

    comment.deleteOne();
    await rec.save();
    res.json({ message: 'Comment deleted.' });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/recommendations/:id/read ─────────────────────────────────────
router.patch('/:id/read', protect, async (req, res, next) => {
  try {
    const rec = await Recommendation.findOneAndUpdate(
      { _id: req.params.id, recommendedTo: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!rec) return res.status(404).json({ error: 'Recommendation not found in your inbox.' });

    res.json({ message: 'Marked as read.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
