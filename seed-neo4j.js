const neo4j = require('neo4j-driver');
const { reviews } = require('./seed-data.js');

async function seedNeo4j() {
  const driver = neo4j.driver(
    'bolt://neo4j:7687',
    neo4j.auth.basic('neo4j', 'password123'),
     {
    encrypted: 'ENCRYPTION_OFF' 
  }
  );
  
  const session = driver.session();
  
  try {
    await driver.verifyConnectivity();
    console.log("Connection verified!");

    await session.run('MATCH (n) DETACH DELETE n');

    await session.run(`
      // ── PEOPLE ─────────────────────────
      CREATE (nolan:Person {id: 'per_nolan', name: 'Christopher Nolan'})
      CREATE (leo:Person {id: 'per_leo', name: 'Leonardo DiCaprio'})
      CREATE (joseph:Person {id: 'per_joseph', name: 'Joseph Gordon-Levitt'})
      CREATE (elliot:Person {id: 'per_elliot', name: 'Elliot Page'})

      CREATE (matthew:Person {id: 'per_mcconaughey', name: 'Matthew McConaughey'})
      CREATE (anne:Person {id: 'per_anne', name: 'Anne Hathaway'})
      CREATE (jessica:Person {id: 'per_jessica', name: 'Jessica Chastain'})

      CREATE (keanu:Person {id: 'per_keanu', name: 'Keanu Reeves'})
      CREATE (laurence:Person {id: 'per_laurence', name: 'Laurence Fishburne'})
      CREATE (carrie:Person {id: 'per_carrie', name: 'Carrie-Anne Moss'})
      CREATE (timothee:Person {id: 'per_timothee', name: 'Timothée Chalamet'})
      CREATE (zendaya:Person {id: 'per_zendaya', name: 'Zendaya'})



      // ── MOVIES ─────────────────────────
      CREATE (inception:Movie {id: 'mov_inception', title: 'Inception'})
      CREATE (interstellar:Movie {id: 'mov_interstellar', title: 'Interstellar'})
      CREATE (matrix:Movie {id: 'mov_matrix', title: 'The Matrix'})
      CREATE (dune:Movie {id: 'mov_dune', title: 'Dune'})
      CREATE (avatar:Movie {id: 'mov_avatar', title: 'Avatar'})
      CREATE (parasite:Movie {id: 'mov_parasite', title: 'Parasite'})
      CREATE (dark:Movie {id: 'mov_dark_knight', title: 'The Dark Knight'})
      CREATE (whiplash:Movie {id: 'mov_whiplash', title: 'Whiplash'})

      // ── DIRECTED ───────────────────────
      CREATE (nolan)-[:DIRECTED]->(inception)
      CREATE (nolan)-[:DIRECTED]->(interstellar)

      // ── ACTED_IN ───────────────────────
      CREATE (leo)-[:ACTED_IN {role: 'Cobb'}]->(inception)
      CREATE (joseph)-[:ACTED_IN]->(inception)
      CREATE (elliot)-[:ACTED_IN]->(inception)

      CREATE (matthew)-[:ACTED_IN {role: 'Cooper'}]->(interstellar)
      CREATE (leo)-[:ACTED_IN]->(interstellar)
      CREATE (anne)-[:ACTED_IN]->(interstellar)
      CREATE (jessica)-[:ACTED_IN]->(interstellar)

      CREATE (keanu)-[:ACTED_IN]->(matrix)
      CREATE (laurence)-[:ACTED_IN]->(matrix)
      CREATE (carrie)-[:ACTED_IN]->(matrix)
      CREATE (timothee)-[:ACTED_IN]->(dune)
      CREATE (zendaya)-[:ACTED_IN]->(dune)

      // ── USERS ───────────────────────
      CREATE (u1:User {id: 'usr_001', username: 'cinephile_alex'})
      CREATE (u2:User {id: 'usr_002', username: 'movie_buff_sam'})
      CREATE (u3:User {id: 'usr_003', username: 'filmfan_jordan'})
      CREATE (u4:User {id: 'usr_004', username: 'screenwriter_pat'})
      CREATE (u991:User {id: 'usr_991', username: 'legacy_user_991'})
      CREATE (u882:User {id: 'usr_882', username: 'legacy_user_882'})

      // ── FOLLOWS ───────────────────────
      // usr_001 follows usr_002 and usr_003
      CREATE (u1)-[:FOLLOWS]->(u2)
      CREATE (u1)-[:FOLLOWS]->(u3)

      // usr_002 follows usr_004
      CREATE (u2)-[:FOLLOWS]->(u4)

      // usr_003 follows usr_001
      CREATE (u3)-[:FOLLOWS]->(u1)
    `);

    console.log("Base data created!");



    // ── REVIEWS (NEO4J) ───────────────────────
await session.run(
  `
  UNWIND $reviews AS r
  MATCH (u:User {id: r.user_id})
  MATCH (m:Movie {id: r.movie_id})
  MERGE (u)-[rel:REVIEWED]->(m)
  SET rel.rating = r.rating,
      rel.text = r.text,
      rel.created_at = r.created_at
  `,
  {
    reviews: reviews.map(r => ({
      ...r,
      created_at: r.created_at.toISOString()
    }))
  }
);

    // ── ACTED_WITH ──────────────────────
    await session.run(`
      MATCH (a:Person)-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(b:Person)
      WHERE a <> b
      MERGE (a)-[:ACTED_WITH]->(b)
    `);

    console.log("ACTED_WITH relationships created!");

    // =======================================================
    // 🎯 RECOMMENDATION 1: Movies based on shared actors
    // =======================================================
    const rec1 = await session.run(`
      MATCH (:Movie {title: "Inception"})<-[:ACTED_IN]-(a:Person)
      MATCH (a)-[:ACTED_WITH]->(coActor)
      MATCH (coActor)-[:ACTED_IN]->(rec:Movie)
      WHERE rec.title <> "Inception"
      RETURN rec.title AS movie, COUNT(*) AS score
      ORDER BY score DESC
    `);

    console.log("\n🎬 Recommended movies based on Inception:");
    rec1.records.forEach(r => {
      console.log(`${r.get('movie')} (score: ${r.get('score')})`);
    });

    // =======================================================
    // 🎯 RECOMMENDATION 2: Movies based on actor network
    // =======================================================
    const rec2 = await session.run(`
      MATCH (p:Person {name: "Leonardo DiCaprio"})-[:ACTED_WITH]->(coActor)
      MATCH (coActor)-[:ACTED_IN]->(m:Movie)
      RETURN m.title AS movie, COUNT(*) AS score
      ORDER BY score DESC
    `);

    // ── REVIEWS (NEO4J) ───────────────────────
    

    console.log("\n🎭 Movies recommended via Leonardo DiCaprio:");
    rec2.records.forEach(r => {
      console.log(`${r.get('movie')} (score: ${r.get('score')})`);
    });

    console.log("\nNeo4j Seeding + Recommendations Complete!");

  } catch (err) {
    console.error("Neo4j error:", err);
  } finally {
    await session.close();
    await driver.close();
  }
}

seedNeo4j();