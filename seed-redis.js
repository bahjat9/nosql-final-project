const { createClient } = require('redis');

async function seedRedis() {
  const client = createClient({ url: 'redis://localhost:6379' });
  
  client.on('error', (err) => console.log('Redis Client Error', err));
  await client.connect();
  console.log("Successfully connected to Redis!");

  await client.flushAll();
  console.log("Cleared old Redis data.");

  console.log("Seeding Trending Movies Leaderboard...");
  await client.zAdd('leaderboard:trending', [
    { score: 1540, value: 'mov_inception' },    
    { score: 1205, value: 'mov_interstellar' }, 
    { score: 980,  value: 'mov_matrix' },       
    { score: 850,  value: 'mov_dune' },         
    { score: 720,  value: 'mov_avatar' }        
  ]);

  console.log("Seeding Cached Movie Dashboards...");
  
  await client.hSet('cache:movie:mov_inception', {
    title: "Inception",
    avg_rating: "4.8",
    total_reviews: "1540",
    cached_at: new Date().toISOString()
  });
  await client.expire('cache:movie:mov_inception', 3600); 

  await client.hSet('cache:movie:mov_interstellar', {
    title: "Interstellar",
    avg_rating: "4.7",
    total_reviews: "1205",
    cached_at: new Date().toISOString()
  });
  await client.expire('cache:movie:mov_interstellar', 3600);

  console.log("Seeding Active User Sessions...");
  await client.set('session:usr_991_token', 'active');
  await client.expire('session:usr_991_token', 1800);

  console.log("Redis Seeding Complete!");
  
  await client.disconnect();
}

seedRedis();