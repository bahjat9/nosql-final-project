# Movie Discovery & Review Platform

This is the final project for the Introduction to NoSQL Databases course. It demonstrates a **Polyglot Persistence** architecture, utilizing MongoDB, Neo4j, and Redis to handle different data workloads for a movie discovery platform.

## Architecture

We utilized three specific NoSQL databases to handle the features they are best suited for:

* **MongoDB (Document):** Acts as the primary system of record. It stores the heavy document data, including the full movie metadata (synopsis, runtime, genres), user profiles, and text-based user reviews.
* **Neo4j (Graph):** Acts as our recommendation and relationship engine. It stores lightweight nodes mapped to MongoDB IDs to quickly calculate the complex web of relationships between actors, directors, and movies.
* **Redis (Key-Value):** Acts as our high-speed caching and real-time analytics layer. It handles temporary API rate limiting, caches frequent movie queries, and maintains a real-time sorted leaderboard of trending movies.

---

## Prerequisites

To run this project locally, you must have the following installed:
* **Docker** and **Docker Compose** (to run the databases)
* **Node.js** and **npm** (to run the database seeding scripts)

---

## How to Run the Project

**1. Clone the repository and navigate to the folder:**
```bash
git clone <>
cd final-project-nosql