const { MongoClient } = require('mongodb');

const URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const { reviews } = require('./seed-data');

async function seedMongo() {
  const client = new MongoClient(URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB!');

    const db = client.db('movie_platform');

    // Clear existing data
    await db.collection('movies').deleteMany({});
    await db.collection('users').deleteMany({});
    await db.collection('reviews').deleteMany({});
    console.log('Cleared old data.');

    // Create text index on movies for plot/title search
    await db.collection('movies').createIndex(
      { title: 'text', plot: 'text', genres: 'text' },
      { name: 'movie_text_search' }
    );
    console.log('Created text index on movies.');

    // ── MOVIES ──────────────────────────────────────────────────────────────
    await db.collection('movies').insertMany([
      {
        _id: 'mov_inception',
        title: 'Inception',
        year: 2010,
        genres: ['Sci-Fi', 'Action', 'Thriller'],
        runtime: 148,
        director: 'Christopher Nolan',
        cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page'],
        plot: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.',
        poster: 'https://example.com/inception.jpg',
        avg_rating: 4.8,
        review_count: 0,
      },
      {
        _id: 'mov_interstellar',
        title: 'Interstellar',
        year: 2014,
        genres: ['Sci-Fi', 'Drama', 'Adventure'],
        runtime: 169,
        director: 'Christopher Nolan',
        cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain'],
        plot: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival on a distant planet.',
        poster: 'https://example.com/interstellar.jpg',
        avg_rating: 4.7,
        review_count: 0,
      },
      {
        _id: 'mov_matrix',
        title: 'The Matrix',
        year: 1999,
        genres: ['Sci-Fi', 'Action'],
        runtime: 136,
        director: 'The Wachowskis',
        cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss'],
        plot: 'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.',
        poster: 'https://example.com/matrix.jpg',
        avg_rating: 4.9,
        review_count: 0,
      },
      {
        _id: 'mov_dune',
        title: 'Dune',
        year: 2021,
        genres: ['Sci-Fi', 'Adventure', 'Drama'],
        runtime: 155,
        director: 'Denis Villeneuve',
        cast: ['Timothée Chalamet', 'Rebecca Ferguson', 'Zendaya'],
        plot: 'A noble family becomes embroiled in a war for control over the galaxy\'s most valuable asset while its heir becomes troubled by visions of a dark future.',
        poster: 'https://example.com/dune.jpg',
        avg_rating: 4.5,
        review_count: 0,
      },
      {
        _id: 'mov_avatar',
        title: 'Avatar',
        year: 2009,
        genres: ['Sci-Fi', 'Action', 'Adventure'],
        runtime: 162,
        director: 'James Cameron',
        cast: ['Sam Worthington', 'Zoe Saldana', 'Sigourney Weaver'],
        plot: 'A paraplegic Marine dispatched to the moon Pandora on a unique mission becomes torn between following his orders and protecting the world he feels is his home.',
        poster: 'https://example.com/avatar.jpg',
        avg_rating: 4.1,
        review_count: 0,
      },
      {
        _id: 'mov_parasite',
        title: 'Parasite',
        year: 2019,
        genres: ['Thriller', 'Drama', 'Comedy'],
        runtime: 132,
        director: 'Bong Joon-ho',
        cast: ['Song Kang-ho', 'Lee Sun-kyun', 'Cho Yeo-jeong'],
        plot: 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.',
        poster: 'https://example.com/parasite.jpg',
        avg_rating: 4.9,
        review_count: 0,
      },
      {
        _id: 'mov_dark_knight',
        title: 'The Dark Knight',
        year: 2008,
        genres: ['Action', 'Crime', 'Drama'],
        runtime: 152,
        director: 'Christopher Nolan',
        cast: ['Christian Bale', 'Heath Ledger', 'Aaron Eckhart'],
        plot: 'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.',
        poster: 'https://example.com/darkknight.jpg',
        avg_rating: 4.9,
        review_count: 0,
      },
      {
        _id: 'mov_whiplash',
        title: 'Whiplash',
        year: 2014,
        genres: ['Drama', 'Music'],
        runtime: 107,
        director: 'Damien Chazelle',
        cast: ['Miles Teller', 'J.K. Simmons', 'Melissa Benoist'],
        plot: 'A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing to realize a student\'s potential.',
        poster: 'https://example.com/whiplash.jpg',
        avg_rating: 4.8,
        review_count: 0,
      },
    ]);
    console.log('Inserted 8 movies.');

    // ── USERS ────────────────────────────────────────────────────────────────
    await db.collection('users').insertMany([
      { _id: 'usr_001', username: 'cinephile_alex', email: 'alex@example.com', joined: new Date('2023-01-15') },
      { _id: 'usr_002', username: 'movie_buff_sam', email: 'sam@example.com', joined: new Date('2023-03-22') },
      { _id: 'usr_003', username: 'filmfan_jordan', email: 'jordan@example.com', joined: new Date('2023-06-10') },
      { _id: 'usr_004', username: 'screenwriter_pat', email: 'pat@example.com', joined: new Date('2024-01-05') },
      { _id: 'usr_991', username: 'legacy_user_991', email: 'user991@example.com', joined: new Date('2022-11-01') },
      { _id: 'usr_882', username: 'legacy_user_882', email: 'user882@example.com', joined: new Date('2022-12-15') },
    ]);
    console.log('Inserted 6 users.');


    await db.collection('reviews').insertMany(reviews);
    console.log('Inserted 16 reviews.');

    // Update review counts on movies using aggregation result
    const reviewCounts = await db.collection('reviews').aggregate([
      { $group: { _id: '$movie_id', count: { $sum: 1 }, avg: { $avg: '$rating' } } }
    ]).toArray();

    for (const { _id, count, avg } of reviewCounts) {
      await db.collection('movies').updateOne(
        { _id },
        { $set: { review_count: count, avg_rating: Math.round(avg * 10) / 10 } }
      );
    }
    console.log('Updated movie review counts and avg ratings.');

    console.log('\nMongoDB Seeding Complete!');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}
seedMongo();
