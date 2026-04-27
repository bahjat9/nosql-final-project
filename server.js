const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const PORT = process.env.PORT || 3000;

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('movie_platform');
  console.log('Connected to MongoDB');
}

// ── MOVIES ───────────────────────────────────────────────────────────────────

// GET /api/movies — list all movies, optional ?genre= filter
app.get('/api/movies', async (req, res) => {
  try {
    const filter = {};
    if (req.query.genre) filter.genres = req.query.genre;

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

// GET /api/movies/search?q= — full-text search on title, plot, genres
app.get('/api/movies/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

    const results = await db.collection('movies')
      .find(
        { $text: { $search: q } },
        { projection: { score: { $meta: 'textScore' } } }
      )
      .sort({ score: { $meta: 'textScore' } })
      .toArray();

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/movies/:id — single movie with reviews
app.get('/api/movies/:id', async (req, res) => {
  try {
    const movie = await db.collection('movies').findOne({ _id: req.params.id });
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    const reviews = await db.collection('reviews')
      .find({ movie_id: req.params.id })
      .sort({ created_at: -1 })
      .toArray();

    res.json({ ...movie, reviews });
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

    // Recalculate avg_rating and review_count
    const stats = await db.collection('reviews').aggregate([
      { $match: { movie_id: req.params.id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).toArray();

    if (stats.length > 0) {
      await db.collection('movies').updateOne(
        { _id: req.params.id },
        { $set: { avg_rating: Math.round(stats[0].avg * 10) / 10, review_count: stats[0].count } }
      );
    }

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
    res.json(user);
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

      return res.json({ type: 'genre_stats', data: genreStats });
    }

    /*
     * Aggregation pipeline 2 — Top Movies with Review Summary
     * Joins movies with their reviews via $lookup, then computes per-movie
     * stats (total reviews, avg rating, latest review date).
     * Useful for a dashboard leaderboard of the best-reviewed films.
     */
    const topMovies = await db.collection('movies').aggregate([
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'movie_id',
          as: 'review_docs',
        },
      },
      {
        $project: {
          title: 1,
          year: 1,
          genres: 1,
          director: 1,
          avg_rating: 1,
          review_count: 1,
          latest_review: { $max: '$review_docs.created_at' },
        },
      },
      { $sort: { avg_rating: -1, review_count: -1 } },
      { $limit: 10 },
    ]).toArray();

    res.json({ type: 'top_movies', data: topMovies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HEALTH ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', db: 'mongodb' }));

// ── START ─────────────────────────────────────────────────────────────────────

connectDB()
  .then(() => app.listen(PORT, () => console.log(`MongoDB API running on port ${PORT}`)))
  .catch((err) => { console.error('Failed to connect to MongoDB:', err); process.exit(1); });
