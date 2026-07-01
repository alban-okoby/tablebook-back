const express = require('express');
const router = express.Router();
const { query, param, validationResult } = require('express-validator');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errors.array() });
    return false;
  }
  return true;
};

// ─── GET /api/users ────────────────────────────────────────────────────────────
// Admin: list all users
router.get(
  '/',
  protect,
  restrictTo('admin'),
  [
    query('q').optional().trim().isLength({ max: 100 }),
    query('role').optional().isIn(['user', 'restaurant_owner', 'admin']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const { q, role, page = 1, limit = 20 } = req.query;
      const filter = {};

      if (q) filter.$or = [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
      if (role) filter.role = role;

      const [users, total] = await Promise.all([
        User.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .select('-password -resetPasswordToken -resetPasswordExpires'),
        User.countDocuments(filter),
      ]);

      res.json({
        users,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/users/:id ────────────────────────────────────────────────────────
router.get('/:id', param('id').isMongoId(), async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user || !user.isActive) return res.status(404).json({ error: 'User not found' });

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/users/:id/bookings ───────────────────────────────────────────────
// Public booking history (completed only) or full list for self/admin
router.get(
  '/:id/bookings',
  protect,
  param('id').isMongoId(),
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const isSelf = req.params.id === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';

      if (!isSelf && !isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const bookings = await Booking.find({ user: req.params.id })
        .sort({ date: -1 })
        .limit(50)
        .populate('restaurant', 'name address cuisine coverImage');

      res.json({ bookings });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/users/:id/role ─────────────────────────────────────────────────
// Admin only: change a user's role
router.patch(
  '/:id/role',
  protect,
  restrictTo('admin'),
  param('id').isMongoId(),
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const { role } = req.body;
      if (!['user', 'restaurant_owner', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true, select: '-password -resetPasswordToken -resetPasswordExpires' }
      );

      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json({ user });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
