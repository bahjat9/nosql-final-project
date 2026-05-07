require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

// Rate limiting — max 100 requests per minute per IP using Redis
app.use(async (req, res, next) => {
  if (!redis) return next();
  try {
    const key = `rate:${req.ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    if (count > 100) return res.status(429).json({ error: 'Too many requests, slow down' });
    next();
  } catch {
    next();
  }
});

// Session validation — routes that require a valid session token
// Pass header: Authorization: Bearer session:<user_id>_token
async function requireSession(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No session token provided' });
  try {
    const status = await redis.get(token);
    if (status !== 'active') return res.status(401).json({ error: 'Invalid or expired session' });
    next();
  } catch {
    next();
  }
}

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is not set");
}
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;
const neo4j = require('neo4j-driver');

const neoDriver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(
    process.env.NEO4J_USER,
    process.env.NEO4J_PASSWORD
  ),
  {
    encrypted: 'ENCRYPTION_OFF'
  }
);

let db;
let redis;

async function connectRedis() {
  redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  redis.on('error', (err) => console.error('Redis error:', err));
  await redis.connect();
  console.log('Connected to Redis');
}

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('movie_platform');
  console.log('Connected to MongoDB');
}

async function getRecommendations(movieId) {
  const session = neoDriver.session();

  try {
    const result = await session.run(`
      MATCH (:Movie {id: $id})<-[:ACTED_IN]-(a:Person)
      MATCH (a)-[:ACTED_WITH]->(coActor)
      MATCH (coActor)-[:ACTED_IN]->(rec:Movie)
      WHERE rec.id <> $id
      RETURN rec.id AS id, rec.title AS title, COUNT(DISTINCT coActor) AS score
      ORDER BY score DESC
      LIMIT 5
    `, { id: movieId });

    return result.records.map(r => ({
      id: r.get('id'),
      title: r.get('title'),
      score: r.get('score').toInt(),
    }));

  } finally {
    await session.close();
  }
}

async function getSocialRecommendations(movieId, userId) {
  const session = neoDriver.session();

  try {
    const result = await session.run(`
      MATCH (u:User {id: $userId})-[:FOLLOWS]->(f:User)
      MATCH (f)-[rev:REVIEWED]->(m:Movie)
      WHERE m.id <> $movieId
      RETURN m.id AS id,
             COUNT(f) AS score,
             AVG(rev.rating) AS avgRating
      ORDER BY score DESC, avgRating DESC
      LIMIT 5
    `, { movieId, userId });

    return result.records.map(r => ({
      id: r.get('id'),
      score: r.get('score').toInt(),
      avgRating: r.get('avgRating'),
      type: 'social'
    }));
  } finally {
    await session.close();
  }
}

async function getUserFollows(userId) {
  const session = neoDriver.session();

  try {
    const result = await session.run(`
      MATCH (u:User {id: $userId})-[:FOLLOWS]->(f:User)
      RETURN f.id AS id, f.username AS username
    `, { userId });

    return result.records.map(r => ({
      id: r.get('id'),
      username: r.get('username')
    }));
  } finally {
    await session.close();
  }
}

// ── MOVIES ───────────────────────────────────────────────────────────────────

// GET /api/movies — list all movies, optional ?genre= filter
app.get('/api/movies', async (req, res) => {
  try {
    const filter = {};
    if (req.query.genre) {
      filter.genres = req.query.genre;
    }

    const movies = await db.collection('movies')
      .find(filter)
      .project({ plot: 0 })
      .sort({ avg_rating: -1 })
      .toArray();

    res.json(movies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/movies/search?q= — Atlas Search on title, plot, genres
// Uses MongoDB Atlas Search ($search) with fuzzy matching so typos still work.
// The Atlas Search index named "movies_search" must be created on the
// movie_platform.movies collection in the Atlas UI (see README).
app.get('/api/movies/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

    const results = await db.collection('movies').aggregate([
      {
        $search: {
          index: 'movies_search',
          text: {
            query: q,
            path: ['title', 'plot', 'genres'],
            fuzzy: { maxEdits: 1 }, // allows 1-character typos
          },
        },
      },
      {
        $addFields: {
          search_score: { $meta: 'searchScore' },
          avg_rating: {
            $cond: [
              { $gt: ['$review_count', 0] },
              { $round: [{ $divide: ['$total_rating', '$review_count'] }, 1] },
              0,
            ],
          },
        },
      },
      { $sort: { search_score: -1 } },
      { $project: { plot: 0, total_rating: 0 } },
    ]).toArray();

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/movies/:id — single movie with reviews
app.get('/api/movies/:id', async (req, res) => {
  try {
    const movieId = req.params.id;
    const userId = req.query.user_id;
    const movie = await db.collection('movies').findOne({ _id: req.params.id });
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    // Calculate avg_rating at read time from stored totals
    movie.avg_rating = movie.review_count > 0
      ? Math.round((movie.total_rating / movie.review_count) * 10) / 10
      : 0;

    const reviews = await db.collection('reviews')
      .find({ movie_id: req.params.id })
      .sort({ created_at: -1 })
      .toArray();
    
    
    
    const recommendations = await getRecommendations(movieId);
    const socialRecommendations = userId
  ? await getSocialRecommendations(movieId, userId)
  : [];

    const recIds = recommendations.map(r => r.id);
    const socialIds = socialRecommendations.map(r => r.id);

    const recMovies = await db.collection('movies')
      .find({ _id: { $in: recIds } })
      .project({ title: 1, poster: 1, avg_rating: 1, review_count: 1, total_rating: 1 })
      .toArray();

    const socialMovies = await db.collection('movies')
      .find({ _id: { $in: socialIds } })
      .project({ title: 1, poster: 1, avg_rating: 1, review_count: 1, total_rating: 1 })
      .toArray();

    // Use hashmaps for O(1) lookups instead of O(n) .find() inside .map()
    const recMoviesMap = Object.fromEntries(recMovies.map(m => [m._id, m]));
    const socialMoviesMap = Object.fromEntries(socialMovies.map(m => [m._id, m]));

    const enrichedRecommendations = recommendations.map(r => {
      const details = recMoviesMap[r.id] || {};
      return { ...r, ...details };
    });

    const enrichedSocial = socialRecommendations.map(r => {
      const details = socialMoviesMap[r.id] || {};
      return { ...r, ...details };
    });

    res.json({
  ...movie,
  reviews,
  movie_recommendations: enrichedRecommendations,
  social_recommendations: enrichedSocial
});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REVIEWS ──────────────────────────────────────────────────────────────────

// GET /api/movies/:id/reviews
app.get('/api/movies/:id/reviews', async (req, res) => {
  try {
    const reviews = await db.collection('reviews')
      .find({ movie_id: req.params.id })
      .sort({ created_at: -1 })
      .toArray();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/movies/:id/reviews — add a review
app.post('/api/movies/:id/reviews', async (req, res) => {
  try {
    const { user_id, rating, text } = req.body;
    if (!user_id || !rating || !text) {
      return res.status(400).json({ error: 'user_id, rating, and text are required' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const movie = await db.collection('movies').findOne({ _id: req.params.id });
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    const review = {
      movie_id: req.params.id,
      user_id,
      rating: Number(rating),
      text,
      created_at: new Date(),
    };

    await db.collection('reviews').insertOne(review);

    // Increment review_count and total_rating on the movie document.
    // avg_rating is derived at read time as total_rating / review_count —
    // no aggregation pipeline needed on every write.
    await db.collection('movies').updateOne(
      { _id: req.params.id },
      { $inc: { review_count: 1, total_rating: Number(rating) } }
    );

    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── USERS ─────────────────────────────────────────────────────────────────────

// GET /api/users/:id
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: req.params.id });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const follows = await getUserFollows(req.params.id);

    res.json({
      ...user,
      follows
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/reviews — all reviews by a user
app.get('/api/users/:id/reviews', async (req, res) => {
  try {
    const reviews = await db.collection('reviews')
      .find({ user_id: req.params.id })
      .sort({ created_at: -1 })
      .toArray();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

// GET /api/dashboard — aggregation pipeline 1: top-rated movies per genre
// GET /api/dashboard?type=genre_stats  → genre breakdown
// GET /api/dashboard?type=top_movies   → top movies by avg rating (default)
app.get('/api/dashboard', async (req, res) => {
  try {
    const type = req.query.type || 'top_movies';
    const cacheKey = `cache:dashboard:${type}`;

    // Check Redis cache first — return immediately if fresh data exists
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ ...JSON.parse(cached), from_cache: true });
    }

    if (type === 'genre_stats') {
      /*
       * Aggregation pipeline 1 — Genre Statistics
       * Unwinds the genres array so each genre becomes its own document,
       * then groups to count movies and compute the average rating per genre.
       * Useful for showing which genres are most popular / highest rated.
       */
      const genreStats = await db.collection('movies').aggregate([
        { $unwind: '$genres' },
        {
          $group: {
            _id: '$genres',
            movie_count: { $sum: 1 },
            avg_rating: { $avg: '$avg_rating' },
            titles: { $push: '$title' },
          },
        },
        { $sort: { movie_count: -1 } },
        {
          $project: {
            genre: '$_id',
            movie_count: 1,
            avg_rating: { $round: ['$avg_rating', 1] },
            titles: 1,
            _id: 0,
          },
        },
      ]).toArray();

      const response = { type: 'genre_stats', data: genreStats };
      await redis.set(cacheKey, JSON.stringify(response), { EX: 3600 });
      return res.json(response);
    }

    /*
     * Aggregation pipeline 2 — Top Movies with Review Summary
     * avg_rating and review_count are stored directly on each movie document
     * and kept up-to-date via $inc on every new review, so no $lookup into
     * the reviews collection is needed here. We also derive avg_rating at
     * read time from total_rating / review_count for accuracy.
     */
    const topMovies = await db.collection('movies').aggregate([
      {
        $project: {
          title: 1,
          year: 1,
          genres: 1,
          director: 1,
          review_count: 1,
          avg_rating: {
            $cond: [
              { $gt: ['$review_count', 0] },
              { $round: [{ $divide: ['$total_rating', '$review_count'] }, 1] },
              0,
            ],
          },
        },
      },
      { $sort: { avg_rating: -1, review_count: -1 } },
      { $limit: 10 },
    ]).toArray();

    const response = { type: 'top_movies', data: topMovies };
    await redis.set(cacheKey, JSON.stringify(response), { EX: 3600 });
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TRENDING ─────────────────────────────────────────────────────────────────

// GET /api/trending — top movies from Redis sorted set, enriched with MongoDB data
app.get('/api/trending', async (req, res) => {
  try {
    // Get top 10 movies by score from Redis leaderboard (highest score first)
    const trending = await redis.zRangeWithScores('leaderboard:trending', 0, 9, { REV: true });

    if (!trending.length) return res.json([]);

    const ids = trending.map(t => t.value);

    // Enrich with full movie details from MongoDB
    const movies = await db.collection('movies')
      .find({ _id: { $in: ids } })
      .project({ title: 1, year: 1, genres: 1, director: 1, avg_rating: 1, review_count: 1, total_rating: 1, poster: 1 })
      .toArray();

    const moviesMap = Object.fromEntries(movies.map(m => [m._id, m]));

    const result = trending.map(t => {
      const movie = moviesMap[t.value] || {};
      return {
        ...movie,
        _id: t.value,
        trending_score: t.score,
        avg_rating: movie.review_count > 0
          ? Math.round((movie.total_rating / movie.review_count) * 10) / 10
          : 0,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trending/:id/view — increment a movie's trending score
app.post('/api/trending/:id/view', async (req, res) => {
  try {
    const newScore = await redis.zIncrBy('leaderboard:trending', 1, req.params.id);
    res.json({ movie_id: req.params.id, trending_score: newScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HEALTH ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', db: 'mongodb' }));

// ── START ─────────────────────────────────────────────────────────────────────

Promise.all([connectDB(), connectRedis()])
  .then(() => app.listen(PORT, () => console.log(`MongoDB API running on port ${PORT}`)))
  .catch((err) => { console.error('Failed to start server:', err); process.exit(1); });

process.on('exit', async () => {
  await neoDriver.close();
});
