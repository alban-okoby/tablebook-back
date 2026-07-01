const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Restaurant = require('../models/Restaurant');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errors.array() });
    return false;
  }
  return true;
};

// ─── GET /api/bookings ─────────────────────────────────────────────────────────
// Get logged-in user's bookings
router.get(
  '/',
  protect,
  [
    query('status').optional().isIn(['pending', 'confirmed', 'cancelled', 'completed', 'no-show']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const { status, page = 1, limit = 10 } = req.query;
      const filter = { user: req.user._id };
      if (status) filter.status = status;

      const [bookings, total] = await Promise.all([
        Booking.find(filter)
          .sort({ date: -1, createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .populate('restaurant', 'name address cuisine coverImage'),
        Booking.countDocuments(filter),
      ]);

      res.json({
        bookings,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/bookings ────────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  [
    body('restaurant').isMongoId().withMessage('Valid restaurant ID is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
    body('time').matches(/^\d{2}:\d{2}$/).withMessage('Time must be in HH:MM format'),
    body('partySize').isInt({ min: 1, max: 50 }).withMessage('Party size must be between 1 and 50'),
    body('specialRequests').optional().trim().isLength({ max: 500 }),
    body('tableLabel').optional().trim(),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const { restaurant: restaurantId, date, time, partySize } = req.body;

      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
      if (!restaurant.isApproved) return res.status(400).json({ error: 'Restaurant is not available for booking' });

      const bookingDate = new Date(date);
      if (bookingDate < new Date()) {
        return res.status(400).json({ error: 'Booking date must be in the future' });
      }

      const booking = await Booking.create({
        restaurant: restaurantId,
        user: req.user._id,
        date: bookingDate,
        time,
        partySize,
        specialRequests: req.body.specialRequests,
        tableLabel: req.body.tableLabel,
      });

      await booking.populate('restaurant', 'name address phone');

      res.status(201).json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/bookings/:id ─────────────────────────────────────────────────────
router.get('/:id', protect, param('id').isMongoId(), async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const booking = await Booking.findById(req.params.id)
      .populate('restaurant', 'name address cuisine coverImage phone email')
      .populate('user', 'username email avatar');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isOwner = booking.user._id.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin' && req.user.role !== 'restaurant_owner') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/bookings/:id/confirm ──────────────────────────────────────────
router.patch(
  '/:id/confirm',
  protect,
  restrictTo('admin', 'restaurant_owner'),
  param('id').isMongoId(),
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (booking.status !== 'pending') {
        return res.status(400).json({ error: `Cannot confirm a booking with status: ${booking.status}` });
      }

      booking.status = 'confirmed';
      await booking.save();

      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/bookings/:id/cancel ───────────────────────────────────────────
router.patch(
  '/:id/cancel',
  protect,
  [
    param('id').isMongoId(),
    body('reason').optional().trim().isLength({ max: 300 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      const isOwner = booking.user.toString() === req.user._id.toString();
      if (!isOwner && req.user.role !== 'admin' && req.user.role !== 'restaurant_owner') {
        return res.status(403).json({ error: 'Not authorized to cancel this booking' });
      }

      if (['cancelled', 'completed'].includes(booking.status)) {
        return res.status(400).json({ error: `Cannot cancel a booking with status: ${booking.status}` });
      }

      booking.status = 'cancelled';
      booking.cancelledAt = new Date();
      booking.cancelledBy = req.user._id;
      booking.cancelReason = req.body.reason;
      await booking.save();

      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/bookings/:id/complete ─────────────────────────────────────────
router.patch(
  '/:id/complete',
  protect,
  restrictTo('admin', 'restaurant_owner'),
  param('id').isMongoId(),
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (booking.status !== 'confirmed') {
        return res.status(400).json({ error: 'Only confirmed bookings can be marked as completed' });
      }

      booking.status = 'completed';
      await booking.save();

      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/bookings/restaurant/:restaurantId ────────────────────────────────
// All bookings for a restaurant (admin / owner)
router.get(
  '/restaurant/:restaurantId',
  protect,
  restrictTo('admin', 'restaurant_owner'),
  [
    param('restaurantId').isMongoId(),
    query('date').optional().isISO8601(),
    query('status').optional().isIn(['pending', 'confirmed', 'cancelled', 'completed', 'no-show']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;

      const { date, status, page = 1, limit = 20 } = req.query;
      const filter = { restaurant: req.params.restaurantId };

      if (status) filter.status = status;
      if (date) {
        const d = new Date(date);
        const next = new Date(date);
        next.setDate(next.getDate() + 1);
        filter.date = { $gte: d, $lt: next };
      }

      const [bookings, total] = await Promise.all([
        Booking.find(filter)
          .sort({ date: 1, time: 1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .populate('user', 'username email phone avatar'),
        Booking.countDocuments(filter),
      ]);

      res.json({
        bookings,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
