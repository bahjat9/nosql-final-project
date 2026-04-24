const neo4j = require('neo4j-driver');

async function seedNeo4j() {
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'password123')
  );
  
  const session = driver.session();
  
  try {
    await driver.verifyConnectivity();
console.log("Connection verified!");

    await session.run('MATCH (n) DETACH DELETE n');

    await session.run(`
      // Create People
      CREATE (nolan:Person {id: 'per_nolan', name: 'Christopher Nolan'})
      CREATE (leo:Person {id: 'per_leo', name: 'Leonardo DiCaprio'})
      CREATE (matthew:Person {id: 'per_mcconaughey', name: 'Matthew McConaughey'})
      
      // Create Movies
      CREATE (inception:Movie {id: 'mov_inception', title: 'Inception'})
      CREATE (interstellar:Movie {id: 'mov_interstellar', title: 'Interstellar'})
      
      // Create Relationships
      CREATE (nolan)-[:DIRECTED]->(inception)
      CREATE (nolan)-[:DIRECTED]->(interstellar)
      CREATE (leo)-[:ACTED_IN {role: 'Cobb'}]->(inception)
      CREATE (matthew)-[:ACTED_IN {role: 'Cooper'}]->(interstellar)
    `);

    console.log("Neo4j Seeding Complete!");
    const result = await session.run('MATCH (p:Person) RETURN p.name AS name');

console.log("People in DB:");
result.records.forEach(record => {
  console.log(record.get('name'));
});
 } catch (err) {
  console.error("Neo4j error:", err);
} finally {
    await session.close();
    await driver.close();
  }
}

seedNeo4j();