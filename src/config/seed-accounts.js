/**
 * Creates the demo accounts: admin, restaurant owner, and a regular user.
 * Idempotent — running it again just reports what already exists.
 * Run from the backend directory:
 *   node src/config/seed-accounts.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./database');
const User = require('../models/User');

const ACCOUNTS = [
  {
    username: 'admin',
    email: 'admin@tablebook.com',
    password: 'Admin@1234',
    role: 'admin',
    bio: 'Platform administrator.',
    isVerified: true,
  },
  {
    username: 'restaurantowner',
    email: 'owner@tablebook.com',
    password: 'Owner@1234',
    role: 'restaurant_owner',
    bio: 'Restaurant owner account.',
    isVerified: true,
  },
  {
    username: 'user1',
    email: 'user1@tablebook.com',
    password: 'Password1',
    role: 'user',
    bio: 'Demo user account.',
    isVerified: true,
  },
];

async function run() {
  await connectDB();

  for (const account of ACCOUNTS) {
    const existing = await User.findOne({
      $or: [{ email: account.email }, { username: account.username }],
    });

    if (existing) {
      if (existing.role !== account.role) {
        existing.role = account.role;
        await existing.save();
        console.log(`Updated existing user "${existing.username}" role -> ${account.role}.`);
      } else {
        console.log(`User "${existing.username}" already exists (role: ${existing.role}).`);
      }
    } else {
      const user = await User.create(account);
      console.log(`Created ${user.role} user: ${user.username} <${user.email}>`);
    }
  }

  console.log('\nDone. Credentials:');
  ACCOUNTS.forEach((a) => console.log(`  ${a.role.padEnd(16)} ${a.email}  /  ${a.password}`));

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
