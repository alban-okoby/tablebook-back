const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const Book = require('../models/Book');
const User = require('../models/User');
const { protect, optionalAuth, restrictTo } = require('../middleware/auth.middleware');

// ─── Validation helpers ───────────────────────────────────────────────────────
const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errors.array() });
    return false;
  }
  return true;
};

const VALID_GENRES = [
  'Fiction', 'Non-Fiction', 'Mystery', 'Science Fiction', 'Fantasy',
  'Romance', 'Thriller', 'Biography', 'History', 'Self-Help',
  'Science', 'Technology', 'Poetry', 'Horror', 'Children',
  'Young Adult', 'Graphic Novel', 'Travel', 'Cooking', 'Art',
];

// ─── GET /api/books ───────────────────────────────────────────────────────────
// Search and list books with filters
router.get(
  '/',
  optionalAuth,
  [
    query('q').optional().trim().isLength({ max: 200 }),
    query('genres').optional().trim(),
    query('minRating').optional().isFloat({ min: 0, max: 5 }),
    query('minYear').optional().isInt({ min: 868 }),
    query('maxYear').optional().isInt({ max: 2100 }),
    query('sortBy').optional().isIn(['relevance', 'newest', 'rating', 'popular', 'title']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const {
        q,
        genres,
        minRating,
        minYear,
        maxYear,
        sortBy = 'newest',
        page = 1,
        limit = 12,
      } = req.query;

      const parsedGenres = genres ? genres.split(',').map((g) => g.trim()) : undefined;

      const [books, total] = await Promise.all([
        Book.searchBooks(q, {
          genres: parsedGenres,
          minRating: minRating ? parseFloat(minRating) : undefined,
          minYear: minYear ? parseInt(minYear) : undefined,
          maxYear: maxYear ? parseInt(maxYear) : undefined,
          sortBy,
          page: parseInt(page),
          limit: parseInt(limit),
        }),
        Book.countDocuments({ isApproved: true }),
      ]);

      res.json({
        books,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/books/featured ──────────────────────────────────────────────────
router.get('/featured', async (req, res, next) => {
  try {
    const books = await Book.find({ isFeatured: true, isApproved: true })
      .sort({ 'ratings.average': -1 })
      .limit(6)
      .populate('addedBy', 'username avatar')
      .select('-reviews');

    res.json({ books });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/books/genres ────────────────────────────────────────────────────
router.get('/genres', (req, res) => {
  res.json({ genres: VALID_GENRES });
});

// ─── GET /api/books/:id ───────────────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id)
      .populate('addedBy', 'username avatar')
      .populate('reviews.user', 'username avatar');

    if (!book || !book.isApproved) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    // Increment view count (fire and forget)
    Book.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec();

    // Check if current user has it wishlisted / read
    let userContext = null;
    if (req.user) {
      const user = await User.findById(req.user._id).select('wishlist booksRead');
      userContext = {
        inWishlist: user.wishlist.includes(book._id),
        hasRead: user.booksRead.includes(book._id),
        userReview: book.reviews.find((r) => r.user._id.equals(req.user._id)) || null,
      };
    }

    res.json({ book, userContext });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/books ──────────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  [
    body('title').trim().notEmpty().isLength({ max: 300 }).withMessage('Title is required'),
    body('authors')
      .isArray({ min: 1 })
      .withMessage('At least one author is required'),
    body('authors.*').trim().notEmpty().withMessage('Author names cannot be empty'),
    body('description').optional().trim().isLength({ max: 5000 }),
    body('genres')
      .optional()
      .isArray()
      .custom((val) => val.every((g) => VALID_GENRES.includes(g)))
      .withMessage('Invalid genre provided'),
    body('publishedYear').optional().isInt({ min: 868, max: 2100 }),
    body('pageCount').optional().isInt({ min: 1 }),
    body('isbn')
      .optional()
      .trim()
      .matches(/^(?:\d{9}[\dX]|\d{13})$/)
      .withMessage('Invalid ISBN format'),
    body('tags').optional().isArray(),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const {
        title, authors, description, genres, publishedYear,
        publisher, pageCount, language, isbn, tags, coverImage, externalIds,
      } = req.body;

      // Check for duplicate ISBN
      if (isbn) {
        const existing = await Book.findOne({ isbn });
        if (existing) {
          return res.status(409).json({
            error: 'A book with this ISBN already exists.',
            bookId: existing._id,
          });
        }
      }

      const book = await Book.create({
        title, authors, description, genres, publishedYear,
        publisher, pageCount, language: language || 'English',
        isbn, tags, coverImage, externalIds,
        addedBy: req.user._id,
      });

      await book.populate('addedBy', 'username avatar');
      res.status(201).json({ book });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/books/:id ─────────────────────────────────────────────────────
router.patch('/:id', protect, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found.' });

    const isOwner = book.addedBy.equals(req.user._id);
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to edit this book.' });
    }

    const allowedFields = [
      'title', 'authors', 'description', 'genres', 'publishedYear',
      'publisher', 'pageCount', 'language', 'coverImage', 'tags',
    ];

    // Admins can also toggle featured/approved
    if (isAdmin) {
      allowedFields.push('isFeatured', 'isApproved');
    }

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) book[field] = req.body[field];
    });

    await book.save();
    res.json({ book });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/books/:id ────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found.' });

    const isOwner = book.addedBy.equals(req.user._id);
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this book.' });
    }

    await book.deleteOne();
    res.json({ message: 'Book deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/books/:id/reviews ─────────────────────────────────────────────
router.post(
  '/:id/reviews',
  protect,
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('body')
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Review must be 10–2000 characters'),
    body('title').optional().trim().isLength({ max: 100 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const book = await Book.findById(req.params.id);
      if (!book) return res.status(404).json({ error: 'Book not found.' });

      // One review per user
      const alreadyReviewed = book.reviews.some((r) => r.user.equals(req.user._id));
      if (alreadyReviewed) {
        return res.status(409).json({ error: 'You have already reviewed this book.' });
      }

      book.reviews.push({
        user: req.user._id,
        rating: req.body.rating,
        title: req.body.title,
        body: req.body.body,
      });

      book.recalculateRatings();
      await book.save();

      // Add to user's booksRead
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { booksRead: book._id },
      });

      await book.populate('reviews.user', 'username avatar');
      const newReview = book.reviews[book.reviews.length - 1];
      res.status(201).json({ review: newReview, ratings: book.ratings });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/books/:id/reviews/:reviewId ───────────────────────────────────
router.patch(
  '/:id/reviews/:reviewId',
  protect,
  [
    body('rating').optional().isInt({ min: 1, max: 5 }),
    body('body').optional().trim().isLength({ min: 10, max: 2000 }),
    body('title').optional().trim().isLength({ max: 100 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const book = await Book.findById(req.params.id);
      if (!book) return res.status(404).json({ error: 'Book not found.' });

      const review = book.reviews.id(req.params.reviewId);
      if (!review) return res.status(404).json({ error: 'Review not found.' });

      if (!review.user.equals(req.user._id)) {
        return res.status(403).json({ error: 'Not authorized to edit this review.' });
      }

      if (req.body.rating !== undefined) review.rating = req.body.rating;
      if (req.body.body !== undefined) review.body = req.body.body;
      if (req.body.title !== undefined) review.title = req.body.title;
      review.isEdited = true;

      book.recalculateRatings();
      await book.save();

      res.json({ review, ratings: book.ratings });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/books/:id/reviews/:reviewId ─────────────────────────────────
router.delete('/:id/reviews/:reviewId', protect, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found.' });

    const review = book.reviews.id(req.params.reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found.' });

    const isOwner = review.user.equals(req.user._id);
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this review.' });
    }

    review.deleteOne();
    book.recalculateRatings();
    await book.save();

    res.json({ message: 'Review deleted.', ratings: book.ratings });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/books/:id/reviews/:reviewId/like ───────────────────────────────
router.post('/:id/reviews/:reviewId/like', protect, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found.' });

    const review = book.reviews.id(req.params.reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found.' });

    const userId = req.user._id;
    const likedIdx = review.likes.indexOf(userId);

    if (likedIdx === -1) {
      review.likes.push(userId);
    } else {
      review.likes.splice(likedIdx, 1);
    }

    await book.save();
    res.json({ liked: likedIdx === -1, likesCount: review.likes.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/books/:id/wishlist ─────────────────────────────────────────────
router.post('/:id/wishlist', protect, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found.' });

    const user = await User.findById(req.user._id);
    const inWishlist = user.wishlist.includes(book._id);

    if (inWishlist) {
      user.wishlist.pull(book._id);
      await Book.findByIdAndUpdate(book._id, { $inc: { saveCount: -1 } });
    } else {
      user.wishlist.addToSet(book._id);
      await Book.findByIdAndUpdate(book._id, { $inc: { saveCount: 1 } });
    }

    await user.save();
    res.json({ inWishlist: !inWishlist, saveCount: book.saveCount + (inWishlist ? -1 : 1) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
