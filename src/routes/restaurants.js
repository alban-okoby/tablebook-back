const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const Restaurant = require('../models/Restaurant');
const { protect, optionalAuth, restrictTo } = require('../middleware/auth.middleware');

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errors.array() });
    return false;
  }
  return true;
};

const VALID_CUISINES = [
  'Italian', 'French', 'Japanese', 'Chinese', 'Indian', 'Mexican',
  'American', 'Mediterranean', 'Thai', 'Greek', 'Spanish', 'Lebanese',
  'Korean', 'Vietnamese', 'Turkish', 'Moroccan', 'Brazilian', 'Seafood',
  'Vegetarian', 'Vegan', 'Steakhouse', 'Fusion', 'Other',
];

// ─── GET /api/restaurants ─────────────────────────────────────────────────────
router.get(
  '/',
  optionalAuth,
  [
    query('q').optional().trim().isLength({ max: 200 }),
    query('cuisine').optional().trim(),
    query('city').optional().trim().isLength({ max: 100 }),
    query('priceRange').optional().isIn(['$', '$$', '$$$', '$$$$']),
    query('minRating').optional().isFloat({ min: 0, max: 5 }),
    query('sortBy').optional().isIn(['relevance', 'newest', 'rating', 'popular', 'name']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const {
        q, cuisine, city, priceRange, minRating,
        sortBy = 'newest', page = 1, limit = 12,
      } = req.query;

      const cuisineList = cuisine ? cuisine.split(',').map((c) => c.trim()) : undefined;

      const [restaurants, total] = await Promise.all([
        Restaurant.search(q, {
          cuisine: cuisineList,
          city,
          priceRange,
          minRating: minRating ? parseFloat(minRating) : undefined,
          sortBy,
          page: parseInt(page),
          limit: parseInt(limit),
        }),
        Restaurant.countDocuments({ isApproved: true }),
      ]);

      res.json({
        restaurants,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/restaurants/featured ───────────────────────────────────────────
router.get('/featured', async (req, res, next) => {
  try {
    const restaurants = await Restaurant.find({ isFeatured: true, isApproved: true })
      .sort({ 'ratings.average': -1 })
      .limit(8)
      .populate('addedBy', 'username avatar')
      .select('-reviews');
    res.json({ restaurants });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/restaurants/:id ─────────────────────────────────────────────────
router.get('/:id', optionalAuth, param('id').isMongoId(), async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    )
      .populate('addedBy', 'username avatar')
      .populate('reviews.user', 'username avatar');

    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
    res.json({ restaurant });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/restaurants ────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  restrictTo('admin', 'restaurant_owner'),
  [
    body('name').trim().notEmpty().isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 3000 }),
    body('cuisine').isArray({ min: 1 }).withMessage('At least one cuisine type is required'),
    body('cuisine.*').isIn(VALID_CUISINES),
    body('address.city').trim().notEmpty().withMessage('City is required'),
    body('phone').optional().trim(),
    body('email').optional().isEmail().normalizeEmail(),
    body('priceRange').optional().isIn(['$', '$$', '$$$', '$$$$']),
    body('tables').optional().isArray(),
    body('openingHours').optional().isArray(),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const restaurant = await Restaurant.create({
        ...req.body,
        addedBy: req.user._id,
      });

      res.status(201).json({ restaurant });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/restaurants/:id ─────────────────────────────────────────────────
router.put(
  '/:id',
  protect,
  param('id').isMongoId(),
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const restaurant = await Restaurant.findById(req.params.id);
      if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

      const isOwner = restaurant.addedBy.toString() === req.user._id.toString();
      if (!isOwner && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to edit this restaurant' });
      }

      const allowed = [
        'name', 'description', 'cuisine', 'address', 'phone', 'email',
        'website', 'images', 'coverImage', 'priceRange', 'tables', 'openingHours',
      ];
      const updates = {};
      allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

      Object.assign(restaurant, updates);
      await restaurant.save();

      res.json({ restaurant });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/restaurants/:id ──────────────────────────────────────────────
router.delete(
  '/:id',
  protect,
  restrictTo('admin'),
  param('id').isMongoId(),
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;
      const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
      if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
      res.json({ message: 'Restaurant deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/restaurants/:id/reviews ───────────────────────────────────────
router.post(
  '/:id/reviews',
  protect,
  [
    param('id').isMongoId(),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('body').trim().isLength({ min: 10, max: 2000 }),
    body('title').optional().trim().isLength({ max: 100 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const restaurant = await Restaurant.findById(req.params.id);
      if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

      const alreadyReviewed = restaurant.reviews.some(
        (r) => r.user.toString() === req.user._id.toString()
      );
      if (alreadyReviewed) {
        return res.status(409).json({ error: 'You have already reviewed this restaurant' });
      }

      restaurant.reviews.push({ ...req.body, user: req.user._id });
      restaurant.recalculateRatings();
      await restaurant.save();

      res.status(201).json({ reviews: restaurant.reviews, ratings: restaurant.ratings });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/restaurants/:id/reviews/:reviewId ───────────────────────────
router.delete(
  '/:id/reviews/:reviewId',
  protect,
  async (req, res, next) => {
    try {
      const restaurant = await Restaurant.findById(req.params.id);
      if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

      const review = restaurant.reviews.id(req.params.reviewId);
      if (!review) return res.status(404).json({ error: 'Review not found' });

      const isAuthor = review.user.toString() === req.user._id.toString();
      if (!isAuthor && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to delete this review' });
      }

      review.deleteOne();
      restaurant.recalculateRatings();
      await restaurant.save();

      res.json({ message: 'Review deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
