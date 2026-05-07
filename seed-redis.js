require('dotenv').config();
const { createClient } = require('redis');

async function seedRedis() {
  const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

  client.on('error', (err) => console.log('Redis Client Error', err));
  await client.connect();
  console.log('Successfully connected to Redis!');

  await client.flushAll();
  console.log('Cleared old Redis data.');

  // ── ALL-TIME TRENDING (sorted set) ───────────────────────────────────────
  console.log('Seeding trending:movies sorted set...');
  await client.zAdd('trending:movies', [
    { score: 1540, value: 'mov_inception' },
    { score: 1205, value: 'mov_interstellar' },
    { score: 980,  value: 'mov_matrix' },
    { score: 850,  value: 'mov_dune' },
    { score: 720,  value: 'mov_avatar' },
  ]);

  // ── DAILY TRENDING (sorted set, expires after 24h) ────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const dailyKey = `trending:daily:${today}`;
  console.log(`Seeding ${dailyKey}...`);
  await client.zAdd(dailyKey, [
    { score: 42, value: 'mov_inception' },
    { score: 38, value: 'mov_dune' },
    { score: 31, value: 'mov_matrix' },
  ]);
  await client.expire(dailyKey, 86400);

  // ── SESSIONS (hash per session, 1h TTL) ───────────────────────────────────
  console.log('Seeding session hashes...');
  await client.hSet('session:usr_991_token', {
    userId: 'usr_991',
    username: 'legacy_user_991',
    role: 'user',
    createdAt: new Date().toISOString(),
  });
  await client.expire('session:usr_991_token', 3600);

  await client.hSet('session:usr_882_token', {
    userId: 'usr_882',
    username: 'legacy_user_882',
    role: 'user',
    createdAt: new Date().toISOString(),
  });
  await client.expire('session:usr_882_token', 3600);

  console.log('Redis Seeding Complete!');
  await client.disconnect();
}

seedRedis();
