# Restaurant Booking App — Backend

A REST API for a restaurant table reservation platform. Users can browse restaurants, make reservations, and manage bookings. Restaurant owners can manage their listings and confirm or complete reservations.

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Runtime    | Node.js v18+                        |
| Framework  | Express.js v5                       |
| Database   | MongoDB Atlas + Mongoose            |
| Auth       | JWT (jsonwebtoken)                  |
| Security   | Helmet, bcryptjs, express-rate-limit, CORS |
| Validation | express-validator                   |

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB Atlas connection
│   ├── middleware/
│   │   ├── auth.js              # Auth routes (register, login, profile)
│   │   └── auth.middleware.js   # JWT protect / restrictTo middleware
│   ├── models/
│   │   ├── User.js              # User schema
│   │   ├── Restaurant.js        # Restaurant + Review schemas
│   │   └── Booking.js           # Reservation schema
│   └── routes/
│       ├── auth.js              # Mounts auth router
│       ├── restaurants.js       # Restaurant CRUD + reviews
│       ├── bookings.js          # Reservation lifecycle
│       └── users.js             # User management
├── server.js                    # Express app entry point
├── .env.example                 # Environment variable template
└── package.json
```

---

## Setup Instructions

### 1. Prerequisites
- Node.js v18 or higher
- MongoDB Atlas account (or local MongoDB)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Fill in your MongoDB URI and JWT secret
```

Required variables:

| Variable               | Description                          |
|------------------------|--------------------------------------|
| `PORT`                 | Server port (default: 5000)          |
| `NODE_ENV`             | `development` or `production`        |
| `MONGODB_URI`          | MongoDB connection string            |
| `JWT_SECRET`           | Secret key for signing tokens        |
| `JWT_EXPIRES_IN`       | Token TTL (e.g. `7d`)               |
| `ALLOWED_ORIGINS`      | Comma-separated CORS origins         |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window           |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms              |

### 4. Start the Server
```bash
# Development (with hot reload)
npm run dev

# Production
node src/server.js
```

The API is available at `http://localhost:5000/api`

---

## Database Schemas

### User
- Authentication: email, password (bcrypt hashed), username
- Profile: avatar, bio, phone
- Roles: `user` | `restaurant_owner` | `admin`

### Restaurant
- Info: name, description, cuisine types, address, phone, email, website
- Pricing: priceRange (`$` → `$$$$`)
- Tables: array of `{ label, capacity, count }`
- Opening hours: per day with open/close times and closed flag
- Embedded reviews with ratings (auto-recalculated average)
- Full-text search on name and description

### Booking
- Links a user to a restaurant for a specific date + time
- Party size, optional table label, special requests
- Status lifecycle: `pending` → `confirmed` → `completed` / `cancelled` / `no-show`
- Auto-generated confirmation code (8-char hex, uppercase)

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint                    | Auth     | Description                  |
|--------|-----------------------------|----------|------------------------------|
| POST   | `/register`                 | Public   | Register a new account       |
| POST   | `/login`                    | Public   | Login and receive JWT        |
| GET    | `/me`                       | Required | Get current user profile     |
| PATCH  | `/me`                       | Required | Update profile (bio, phone, avatar, username) |
| PATCH  | `/change-password`          | Required | Change password              |
| DELETE | `/me`                       | Required | Deactivate account           |

### Restaurants — `/api/restaurants`

| Method | Endpoint                    | Auth             | Description                        |
|--------|-----------------------------|------------------|------------------------------------|
| GET    | `/`                         | Optional         | Search/filter restaurants          |
| GET    | `/featured`                 | Public           | Get featured restaurants           |
| GET    | `/:id`                      | Optional         | Restaurant details + reviews       |
| POST   | `/`                         | Owner / Admin    | Create a restaurant                |
| PUT    | `/:id`                      | Owner / Admin    | Update restaurant info             |
| DELETE | `/:id`                      | Admin            | Delete a restaurant                |
| POST   | `/:id/reviews`              | Required         | Submit a review                    |
| DELETE | `/:id/reviews/:reviewId`    | Author / Admin   | Delete a review                    |

**Query params for `GET /`:** `q`, `cuisine`, `city`, `priceRange`, `minRating`, `sortBy`, `page`, `limit`

### Bookings — `/api/bookings`

| Method | Endpoint                          | Auth             | Description                        |
|--------|-----------------------------------|------------------|------------------------------------|
| GET    | `/`                               | Required         | Get my reservations                |
| POST   | `/`                               | Required         | Create a reservation               |
| GET    | `/:id`                            | Owner / Admin    | Get reservation details            |
| PATCH  | `/:id/confirm`                    | Owner / Admin    | Confirm a pending booking          |
| PATCH  | `/:id/cancel`                     | User / Admin     | Cancel a booking                   |
| PATCH  | `/:id/complete`                   | Owner / Admin    | Mark a booking as completed        |
| GET    | `/restaurant/:restaurantId`       | Owner / Admin    | All bookings for a restaurant      |

### Users — `/api/users`

| Method | Endpoint            | Auth     | Description                        |
|--------|---------------------|----------|------------------------------------|
| GET    | `/`                 | Admin    | List all users (search + filter)   |
| GET    | `/:id`              | Public   | Get user profile                   |
| GET    | `/:id/bookings`     | Self / Admin | User booking history           |
| PATCH  | `/:id/role`         | Admin    | Change a user's role               |

---

## Roles

| Role               | Capabilities                                              |
|--------------------|-----------------------------------------------------------|
| `user`             | Browse restaurants, make and cancel own bookings, leave reviews |
| `restaurant_owner` | All user permissions + create/edit restaurants, confirm/complete bookings |
| `admin`            | Full access — manage users, restaurants, any booking      |
