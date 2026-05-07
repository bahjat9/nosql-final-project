# Movie Discovery & Review Platform

Final project for the Introduction to NoSQL Databases course. Demonstrates a **Polyglot Persistence** architecture using MongoDB, Neo4j, and Redis to handle different data workloads for a movie discovery and recommendation platform.

---

## Architecture

| Database | Role | What it stores |
|---|---|---|
| **MongoDB Atlas** | Primary system of record | Movies, users, reviews, aggregation pipelines, Atlas Search |
| **Neo4j** | Recommendation & relationship engine | Actor/director nodes, ACTED_IN, FOLLOWS, ACTED_WITH relationships |
| **Redis** | Caching & real-time analytics | Trending leaderboard, dashboard cache, session tokens, rate limiting |

The databases share a common ID scheme (e.g. `mov_inception`, `usr_001`) so they can reference each other without joins across systems.

---

## Prerequisites

- **Docker** and **Docker Compose**
- **Node.js** and **npm**
- **MongoDB Atlas account** (free tier) — for Atlas Search

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/bahjat9/nosql-final-project.git
cd nosql-final-project
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up MongoDB Atlas

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and create a free M0 cluster
2. Go to **Database Access** and create a database user with read/write permissions
3. Go to **Network Access** and add `0.0.0.0/0` to allow connections from anywhere
4. Click **Connect** on your cluster → **Drivers** → copy the connection string

### 4. Create the Atlas Search index

1. In Atlas, go to your cluster → **Search & Vector Search** (left sidebar)
2. Click **Create Search Index** → **Visual Editor** → Next
3. Select database `movie_platform` and collection `movies`
4. Name the index exactly: `movies_search`
5. Leave all other settings as default → **Create Search Index**
6. Wait about 1 minute for the index status to show **Active**

### 5. Create your .env file

Create a file called `.env` in the project root:

```
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/movie_platform?retryWrites=true&w=majority
```

Replace `<username>`, `<password>`, and `<cluster>` with your Atlas credentials.

---

## Running the Project

### Start all containers (Neo4j + Redis + App)

```bash
docker compose up -d
```

### Seed all three databases

```bash
npm run seed
```

This runs all three seed scripts in order:
- `seed-mongodb.js` — inserts 8 movies, 6 users, 16 reviews into Atlas
- `seed-neo4j.js` — creates movie/person nodes and relationships in Neo4j
- `seed-redis.js` — seeds trending leaderboard, cached dashboards, and a session token

The API server starts automatically via Docker on **http://localhost:3000**.

---

## Testing the API

Open `test.http` in VSCode with the **REST Client** extension (Huachao Mao) installed. Click **Send Request** above any block to run it.

### Available Endpoints

#### MongoDB
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/movies` | All movies, sorted by rating. Optional `?genre=` filter |
| GET | `/api/movies/search?q=` | Atlas Search — fuzzy full-text search on title, plot, genres |
| GET | `/api/movies/:id` | Single movie with reviews and Neo4j recommendations |
| GET | `/api/movies/:id/reviews` | All reviews for a movie |
| POST | `/api/movies/:id/reviews` | Add a review `{ user_id, rating, text }` |
| GET | `/api/users/:id` | User profile with Neo4j follows |
| GET | `/api/users/:id/reviews` | All reviews by a user |
| GET | `/api/dashboard` | Top 10 movies leaderboard (cached in Redis) |
| GET | `/api/dashboard?type=genre_stats` | Genre breakdown — movie count and avg rating per genre |

#### Redis
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trending` | Top trending movies from Redis sorted set |
| POST | `/api/trending/:id/view` | Increment a movie's trending score |

#### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Server and database status |

---

## Database Design

### MongoDB Collections

**movies**
```json
{
  "_id": "mov_inception",
  "title": "Inception",
  "year": 2010,
  "genres": ["Sci-Fi", "Action"],
  "director": "Christopher Nolan",
  "cast": ["Leonardo DiCaprio"],
  "plot": "A thief who steals corporate secrets...",
  "review_count": 3,
  "total_rating": 15,
  "avg_rating": 5
}
```

**reviews**
```json
{
  "movie_id": "mov_inception",
  "user_id": "usr_001",
  "rating": 5,
  "text": "Mind-blowing concept.",
  "created_at": "2024-01-10T00:00:00.000Z"
}
```

**users**
```json
{
  "_id": "usr_001",
  "username": "cinephile_alex",
  "email": "alex@example.com",
  "joined": "2023-01-15T00:00:00.000Z"
}
```

### MongoDB Aggregation Pipelines

**Pipeline 1 — Genre Statistics** (`GET /api/dashboard?type=genre_stats`)
Unwinds the genres array, then groups by genre to count movies and compute average rating per genre.

**Pipeline 2 — Top Movies Leaderboard** (`GET /api/dashboard`)
Projects top 10 movies sorted by avg_rating, computed from stored `total_rating / review_count` — no join needed.

### Neo4j Graph

**Nodes:** `Movie`, `Person`, `User`

**Relationships:**
- `(Person)-[:DIRECTED]->(Movie)`
- `(Person)-[:ACTED_IN {role}]->(Movie)`
- `(Person)-[:ACTED_WITH]->(Person)`
- `(User)-[:FOLLOWS]->(User)`
- `(User)-[:REVIEWED {rating}]->(Movie)`

**Path Traversal Query — Actor-based Recommendations:**
```cypher
MATCH (:Movie {id: $id})<-[:ACTED_IN]-(a:Person)
MATCH (a)-[:ACTED_WITH]->(coActor)
MATCH (coActor)-[:ACTED_IN]->(rec:Movie)
WHERE rec.id <> $id
RETURN rec.id, rec.title, COUNT(DISTINCT coActor) AS score
ORDER BY score DESC LIMIT 5
```

### Redis Data Structures

| Key pattern | Type | Purpose | TTL |
|---|---|---|---|
| `leaderboard:trending` | Sorted Set | Movie view scores for trending | None |
| `cache:dashboard:*` | String (JSON) | Cached dashboard responses | 1 hour |
| `cache:movie:*` | Hash | Cached movie stats | 1 hour |
| `session:<user_id>_token` | String | Active user sessions | 30 min |
| `rate:<ip>` | String | Request count for rate limiting | 1 min |

---

## Project Structure

```
.
├── server.js          # Express API — all routes for MongoDB, Neo4j, Redis
├── seed-mongodb.js    # Seeds movies, users, reviews into MongoDB Atlas
├── seed-neo4j.js      # Seeds nodes and relationships into Neo4j
├── seed-redis.js      # Seeds trending leaderboard, cache, sessions into Redis
├── seed-data.js       # Shared review data used by both MongoDB and Neo4j seeds
├── docker-compose.yml # Runs Neo4j, Redis, and the Node app
├── Dockerfile         # Container definition for the Node app
├── test.http          # Full API test suite for VSCode REST Client
├── .env.example       # Template for environment variables
└── .gitignore
```
