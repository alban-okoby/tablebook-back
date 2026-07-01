/**
 * Seeds featured restaurants into the database.
 * Requires the admin user (admin@tablebook.com) to exist first.
 * Run from the backend directory:
 *   node src/config/seed-restaurants.js
 * Clear only seeded restaurants:
 *   node src/config/seed-restaurants.js --clear
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./database');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function hours(openH = '12:00', closeH = '23:00', closedDays = []) {
  return DAYS.map((day) => ({
    day,
    open: openH,
    close: closeH,
    isClosed: closedDays.includes(day),
  }));
}

function tables(...configs) {
  return configs.map(([label, capacity, count]) => ({ label, capacity, count }));
}

const RESTAURANTS = [
  {
    name: 'Maison Dorée',
    description:
      'An intimate French bistro in the heart of Manhattan. Classic coq au vin, duck confit, and a wine list curated by a former sommelier from Lyon. White tablecloths, warm candlelight, and the kind of service that makes every visit feel like a special occasion.',
    cuisine: ['French'],
    priceRange: '$$$',
    address: { street: '42 West 54th St', city: 'New York', state: 'NY', country: 'US', zipCode: '10019' },
    phone: '+1 212 555 0101',
    email: 'reservations@maisondoree.com',
    coverImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    openingHours: hours('17:00', '23:00', ['monday']),
    tables: tables(['Bar', 2, 4], ['Standard', 4, 8], ['Private', 6, 2]),
    ratings: { average: 4.8, count: 312 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'Sakura Garden',
    description:
      'Authentic Japanese cuisine from a Tokyo-trained chef. Our omakase menu changes with the seasons, featuring hand-selected fish flown in daily. The minimalist bamboo interior and curated sake menu complete an unforgettable experience.',
    cuisine: ['Japanese'],
    priceRange: '$$$$',
    address: { street: '88 Bleecker St', city: 'New York', state: 'NY', country: 'US', zipCode: '10012' },
    phone: '+1 212 555 0202',
    email: 'info@sakuragarden.com',
    coverImage: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80',
    openingHours: hours('18:00', '23:30', ['tuesday']),
    tables: tables(['Counter', 1, 8], ['Table', 2, 6], ['Tatami', 6, 2]),
    ratings: { average: 4.9, count: 198 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'La Piazza',
    description:
      'A slice of Naples in Chicago. Our wood-fired oven burns at 900°F to produce the perfect Neapolitan crust — soft, chewy, and slightly charred at the edges. Beyond pizza, our handmade pastas and fresh burrata speak for themselves.',
    cuisine: ['Italian'],
    priceRange: '$$',
    address: { street: '200 N Michigan Ave', city: 'Chicago', state: 'IL', country: 'US', zipCode: '60601' },
    phone: '+1 312 555 0303',
    email: 'ciao@lapiazza.com',
    coverImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
    openingHours: hours('11:30', '22:30', ['sunday']),
    tables: tables(['Two-top', 2, 10], ['Four-top', 4, 8], ['Large', 8, 2]),
    ratings: { average: 4.6, count: 541 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'Spice Route',
    description:
      'Modern Indian cuisine that honours tradition while embracing technique. Our tandoor works overtime producing buttery naan and smoky seekh kebabs. The chef\'s tasting menu — paired with Indian craft cocktails — tells the story of the subcontinent through seven courses.',
    cuisine: ['Indian'],
    priceRange: '$$$',
    address: { street: '510 Lexington Ave', city: 'New York', state: 'NY', country: 'US', zipCode: '10017' },
    phone: '+1 212 555 0404',
    email: 'hello@spiceroute.com',
    coverImage: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=80',
    openingHours: hours('12:00', '22:00'),
    tables: tables(['Standard', 4, 12], ['Booth', 6, 4]),
    ratings: { average: 4.7, count: 287 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'The Blue Anchor',
    description:
      'Fresh Atlantic seafood served with a view of the harbour. Whole lobster, oysters shucked to order, and New England chowder that has been on the menu since 1982. The fish is sourced every morning from local boats — what we sell is what came in that day.',
    cuisine: ['Seafood', 'American'],
    priceRange: '$$$',
    address: { street: '1 Harbor Walk', city: 'Boston', state: 'MA', country: 'US', zipCode: '02110' },
    phone: '+1 617 555 0505',
    email: 'dock@blueanchor.com',
    coverImage: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=800&q=80',
    openingHours: hours('11:00', '22:00', ['monday']),
    tables: tables(['Harbour view', 2, 6], ['Main room', 4, 10], ['Group', 10, 2]),
    ratings: { average: 4.5, count: 423 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'Verde Cocina',
    description:
      'Plant-forward Mexican cooking from a Oaxacan-born chef. Our mole negro takes three days to prepare. Everything else — the tortillas, the salsas, the agua fresca — is made from scratch every morning. No freezers, no shortcuts.',
    cuisine: ['Mexican', 'Vegetarian', 'Vegan'],
    priceRange: '$$',
    address: { street: '722 Valencia St', city: 'San Francisco', state: 'CA', country: 'US', zipCode: '94110' },
    phone: '+1 415 555 0606',
    email: 'hola@verdecocina.com',
    coverImage: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80',
    openingHours: hours('11:00', '21:30', ['tuesday']),
    tables: tables(['Counter', 1, 6], ['Patio', 4, 8], ['Indoor', 4, 6]),
    ratings: { average: 4.6, count: 356 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'Seoul Kitchen',
    description:
      'Barbecue the way it was meant to be — at your table, over live charcoal. Our prime short ribs, belly, and marinated chicken are sourced from a single family farm in Virginia. House-made banchan changes daily. Come hungry, leave happy.',
    cuisine: ['Korean'],
    priceRange: '$$',
    address: { street: '35 W 32nd St', city: 'New York', state: 'NY', country: 'US', zipCode: '10001' },
    phone: '+1 212 555 0707',
    email: 'bbq@seoulkitchen.com',
    coverImage: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800&q=80',
    openingHours: hours('12:00', '23:00'),
    tables: tables(['BBQ table', 4, 14], ['Group BBQ', 8, 4]),
    ratings: { average: 4.7, count: 609 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'Agora Mediterranean',
    description:
      'Mezze, grilled meats, and fresh salads inspired by the shores of Greece, Turkey, and Lebanon. The hummus is blended to order; the lamb chops are marinated for 24 hours in herbs from our roof garden. A warm, bustling atmosphere that feels like a village square.',
    cuisine: ['Mediterranean', 'Greek', 'Lebanese'],
    priceRange: '$$',
    address: { street: '100 S Wacker Dr', city: 'Chicago', state: 'IL', country: 'US', zipCode: '60606' },
    phone: '+1 312 555 0808',
    email: 'eat@agoramediterranean.com',
    coverImage: 'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=800&q=80',
    openingHours: hours('11:30', '23:00', ['monday']),
    tables: tables(['Two-top', 2, 8], ['Four-top', 4, 10], ['Communal', 12, 1]),
    ratings: { average: 4.4, count: 478 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'The Ember Grill',
    description:
      'A temple to great American beef. USDA Prime dry-aged on premises for 45 days, hand-cut to order, and cooked over pure hardwood embers. Our bone-in ribeye has earned its own fan following. Classic sides, an encyclopaedic whiskey selection, and a cellar worthy of the steak.',
    cuisine: ['Steakhouse', 'American'],
    priceRange: '$$$$',
    address: { street: '801 Pennsylvania Ave NW', city: 'Washington', state: 'DC', country: 'US', zipCode: '20004' },
    phone: '+1 202 555 0909',
    email: 'reserve@embergrilldc.com',
    coverImage: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80',
    openingHours: hours('17:00', '23:00', ['sunday', 'monday']),
    tables: tables(['Two-top', 2, 6], ['Four-top', 4, 10], ['Private dining', 10, 2]),
    ratings: { average: 4.8, count: 264 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'Pho Saigon',
    description:
      'Three generations of the Nguyen family have perfected one thing: beef pho. The broth simmers for 18 hours with charred ginger, star anise, and beef knuckle. Simple, honest, extraordinary. Our banh mi is also the best in the city — ask anyone.',
    cuisine: ['Vietnamese'],
    priceRange: '$',
    address: { street: '400 Bolsa Ave', city: 'Los Angeles', state: 'CA', country: 'US', zipCode: '90012' },
    phone: '+1 213 555 1010',
    email: 'pho@phosaigonla.com',
    coverImage: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800&q=80',
    openingHours: hours('09:00', '21:00'),
    tables: tables(['Two-top', 2, 8], ['Four-top', 4, 6]),
    ratings: { average: 4.5, count: 812 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'Marrakech Table',
    description:
      'Slow-cooked tagines, fragrant couscous, and warm hospitality in the Moroccan tradition. Our lamb mechoui — a whole shoulder braised with smen and argan — needs 24-hour notice. The mint tea ceremony is complimentary for every table.',
    cuisine: ['Moroccan', 'Mediterranean'],
    priceRange: '$$',
    address: { street: '240 Kent Ave', city: 'Brooklyn', state: 'NY', country: 'US', zipCode: '11249' },
    phone: '+1 718 555 1111',
    email: 'welcome@marrakectable.com',
    coverImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80',
    openingHours: hours('17:30', '22:30', ['tuesday']),
    tables: tables(['Two-top', 2, 6], ['Cushion floor', 6, 3], ['Standard', 4, 6]),
    ratings: { average: 4.6, count: 193 },
    isFeatured: true,
    isApproved: true,
  },
  {
    name: 'Altitude Fusion',
    description:
      'A boundary-pushing menu that treats the world as one larder. Wagyu tartare with kimchi, crispy duck breast with mole, white truffle risotto finished tableside. The tasting menu is 9 courses and changes monthly with the chef\'s obsessions. Views of the city skyline included.',
    cuisine: ['Fusion', 'Japanese', 'French'],
    priceRange: '$$$$',
    address: { street: '50 Fremont St', city: 'San Francisco', state: 'CA', country: 'US', zipCode: '94105' },
    phone: '+1 415 555 1212',
    email: 'reservations@altitudefusion.com',
    coverImage: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=80',
    openingHours: hours('18:00', '23:30', ['monday', 'tuesday']),
    tables: tables(['Window', 2, 8], ['Main floor', 4, 10], ['Chef table', 6, 1]),
    ratings: { average: 4.9, count: 142 },
    isFeatured: true,
    isApproved: true,
  },
];

async function run() {
  await connectDB();

  if (process.argv[2] === '--clear') {
    const result = await Restaurant.deleteMany({ isFeatured: true, name: { $in: RESTAURANTS.map((r) => r.name) } });
    console.log(`Removed ${result.deletedCount} seeded restaurant(s).`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.error('No admin user found. Run `node src/config/create-admin.js` first.');
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const data of RESTAURANTS) {
    const exists = await Restaurant.findOne({ name: data.name });
    if (exists) {
      skipped++;
      continue;
    }
    await Restaurant.create({ ...data, addedBy: admin._id });
    created++;
    process.stdout.write(`  + ${data.name}\n`);
  }

  console.log(`\nDone. ${created} restaurant(s) created, ${skipped} already existed.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
