# 🎬 Movie Platform – Setup & Seeding Guide

This project currently uses **MongoDB**, **Neo4j**, and a Node.js API running in Docker.

---

## 📦 1. Install Dependencies

Run this in the project root:

```bash
npm install
```

Then install Express (if not already included in `package.json`):

```bash
npm install express
```

---

## 🐳 2. Start the Application with Docker

Build and start all services (MongoDB, Neo4j, and the app):

```bash
docker compose up --build
```

This will start:

- MongoDB on `localhost:27017`
- Neo4j on `localhost:7474`
- Node API on `localhost:3000`

---

## 🌱 3. Seed MongoDB (in a new terminal)

Open a second terminal and run:

```bash
docker compose exec app node seed-mongodb.js
```

This will:

- Clear existing MongoDB data
- Insert movies, users, and reviews
- Update average ratings and review counts

---

## 🌿 4. Seed Neo4j (after MongoDB is done)

Then run:

```bash
docker compose exec app node seed-neo4j.js
```

This will:

- Clear Neo4j graph
- Insert people, movies, users
- Create relationships (`ACTED_IN`, `DIRECTED`, `FOLLOWS`)
- Add `REVIEWED` relationships from shared seed data
- Generate `ACTED_WITH` relationships
- Run recommendation queries

---

## 🔗 5. URL Examples

- For example API requests and endpoint references, see:

test.http
- This file contains ready-to-use URL examples for interacting with the API.

---

## ⚠️ Important Notes

- Always run MongoDB seed first, then Neo4j seed
- Make sure Docker containers are fully running before seeding
- If something breaks, reset everything with:

```bash
docker compose down -v
docker compose up --build
```