/**
 * Creates an admin user in the database.
 * Run from the backend directory:
 *   node src/config/create-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./database');
const User = require('../models/User');

const ADMIN = {
  username: 'admin',
  email: 'admin@tablebook.com',
  password: 'Admin@1234',
  role: 'admin',
  bio: 'Platform administrator.',
  isVerified: true,
};

async function run() {
  await connectDB();

  const existing = await User.findOne({
    $or: [{ email: ADMIN.email }, { username: ADMIN.username }],
  });

  if (existing) {
    // Promote to admin if not already
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      console.log(`Promoted existing user "${existing.username}" to admin.`);
    } else {
      console.log(`Admin user "${existing.username}" already exists.`);
    }
    console.log(`  Email:    ${existing.email}`);
    console.log(`  Role:     ${existing.role}`);
  } else {
    const user = await User.create(ADMIN);
    console.log('Admin user created successfully.');
    console.log(`  Username: ${user.username}`);
    console.log(`  Email:    ${user.email}`);
    console.log(`  Password: Admin@1234`);
    console.log(`  Role:     ${user.role}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
