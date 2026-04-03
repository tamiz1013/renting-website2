/**
 * Seed script — creates initial admin user and default pricing.
 * Run: npm run seed
 */
import './config/db.js';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import Pricing from './models/Pricing.js';

async function seed() {
  // Wait for connection
  await new Promise((r) => setTimeout(r, 2000));

  // Create admin user
  const adminExists = await User.findOne({ email: 'admin@example.com' });
  if (!adminExists) {
    const hashed = await bcrypt.hash('admin123', 12);
    await User.create({
      name: 'Admin',
      email: 'admin@example.com',
      password: hashed,
      role: 'admin',
      balance: 10000,
    });
    console.log('Created admin user: admin@example.com / admin123');
  } else {
    console.log('Admin user already exists');
  }

  // Create default pricing
  const defaultPlatforms = [
    { platform: 'facebook', short_term_price: 2, long_term_7d_price: 10, long_term_1m_price: 30, long_term_3m_price: 70 },
    { platform: 'google', short_term_price: 3, long_term_7d_price: 15, long_term_1m_price: 40, long_term_3m_price: 90 },
    { platform: 'craigslist', short_term_price: 1.5, long_term_7d_price: 8, long_term_1m_price: 25, long_term_3m_price: 60 },
    { platform: 'twitter', short_term_price: 2.5, long_term_7d_price: 12, long_term_1m_price: 35, long_term_3m_price: 80 },
    { platform: 'instagram', short_term_price: 2, long_term_7d_price: 10, long_term_1m_price: 30, long_term_3m_price: 70 },
  ];

  for (const p of defaultPlatforms) {
    await Pricing.findOneAndUpdate(
      { platform: p.platform },
      { $set: p },
      { upsert: true }
    );
  }
  console.log('Default pricing seeded');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
