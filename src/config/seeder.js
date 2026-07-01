/**
 * Database Seeder
 * Run with: node config/seeder.js
 * Clear DB:  node config/seeder.js --clear
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./database');
const User = require('../models/User');
const Book = require('../models/Book');
const Recommendation = require('../models/Recommendation');

const sampleBooks = [
  {
    title: 'The Hitchhiker\'s Guide to the Galaxy',
    authors: ['Douglas Adams'],
    description: 'A wholly remarkable book about a hapless human who finds himself hitching rides across the universe after Earth is demolished to make way for a hyperspace bypass.',
    genres: ['Science Fiction', 'Fiction'],
    publishedYear: 1979,
    publisher: 'Pan Books',
    pageCount: 193,
    language: 'English',
    tags: ['humor', 'space', 'adventure', 'classic'],
    isbn: '9780345391803',
  },
  {
    title: 'Sapiens: A Brief History of Humankind',
    authors: ['Yuval Noah Harari'],
    description: 'A groundbreaking narrative of humanity\'s creation and evolution that explores the ways biology and history have defined us.',
    genres: ['History', 'Non-Fiction', 'Science'],
    publishedYear: 2011,
    publisher: 'Harvill Secker',
    pageCount: 443,
    language: 'English',
    tags: ['history', 'evolution', 'anthropology', 'civilization'],
    isbn: '9780062316097',
  },
  {
    title: 'Atomic Habits',
    authors: ['James Clear'],
    description: 'A practical guide to breaking bad habits and building good ones through tiny, incremental changes.',
    genres: ['Self-Help', 'Non-Fiction'],
    publishedYear: 2018,
    publisher: 'Avery',
    pageCount: 320,
    language: 'English',
    tags: ['habits', 'productivity', 'psychology', 'self-improvement'],
    isbn: '9780735211292',
  },
  {
    title: 'Dune',
    authors: ['Frank Herbert'],
    description: 'Set in the distant future amidst a feudal interstellar society, Dune tells the story of a young nobleman who becomes a messianic figure on a desert planet.',
    genres: ['Science Fiction', 'Fantasy', 'Fiction'],
    publishedYear: 1965,
    publisher: 'Chilton Books',
    pageCount: 412,
    language: 'English',
    tags: ['epic', 'politics', 'ecology', 'classic', 'space'],
    isbn: '9780441013593',
  },
  {
    title: 'The Great Gatsby',
    authors: ['F. Scott Fitzgerald'],
    description: 'A portrait of the Jazz Age in all its decadence and excess, exploring themes of wealth, class, love, and the American Dream.',
    genres: ['Fiction'],
    publishedYear: 1925,
    publisher: 'Charles Scribner\'s Sons',
    pageCount: 180,
    language: 'English',
    tags: ['classic', 'american literature', 'jazz age', 'wealth'],
    isbn: '9780743273565',
  },
];

const seed = async () => {
  await connectDB();

  try {
    if (process.argv[2] === '--clear') {
      await Promise.all([
        User.deleteMany({}),
        Book.deleteMany({}),
        Recommendation.deleteMany({}),
      ]);
      console.log('🗑️  Database cleared');
      process.exit(0);
    }

    // Create an admin user
    const adminUser = await User.create({
      username: 'bookadmin',
      email: 'admin@bookrec.com',
      password: 'Admin@1234',
      role: 'admin',
      bio: 'Platform administrator and avid reader.',
      isVerified: true,
    });
    console.log('✅ Admin user created');

    // Create sample books linked to the admin
    const books = await Book.insertMany(
      sampleBooks.map((b) => ({ ...b, addedBy: adminUser._id }))
    );
    console.log(`✅ ${books.length} books seeded`);

    // Create a sample recommendation
    await Recommendation.create({
      book: books[0]._id,
      recommendedBy: adminUser._id,
      message: 'This is the ultimate guide to the universe — don\'t leave Earth without it!',
      reasonTags: ['Funny', 'Classic', 'Great story'],
      visibility: 'public',
    });
    console.log('✅ Sample recommendation created');

    console.log('\n🎉 Database seeded successfully!');
    console.log('   Admin credentials: admin@bookrec.com / Admin@1234');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

seed();
