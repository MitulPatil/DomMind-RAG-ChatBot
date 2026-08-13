// test-rls.js — run after setting up RLS to confirm it works
// node test-rls.js

import { pool, adminPool, setRlsContext } from "../db/db.js";

async function testRls() {
  console.log("Testing Row Level Security...\n");

  // Get two user IDs from the database
  const users = await adminPool.query(
    "SELECT id, email FROM users ORDER BY id LIMIT 2"
  );

  if (users.rows.length < 2) {
    console.log("Need at least 2 users to test isolation. Register 2 users first.");
    process.exit(1);
  }

  const userA = users.rows[0];
  const userB = users.rows[1];

  console.log(`User A: ${userA.email} (id: ${userA.id})`);
  console.log(`User B: ${userB.email} (id: ${userB.id})\n`);

  // Test 1: User A can see their own documents
  await setRlsContext(userA.id);
  const userADocs = await pool.query("SELECT id, filename FROM documents");
  console.log(`User A sees ${userADocs.rows.length} documents:`);
  userADocs.rows.forEach(d => console.log(`  - ${d.filename} (id: ${d.id})`));

  // Test 2: User B can see their own documents
  await setRlsContext(userB.id);
  const userBDocs = await pool.query("SELECT id, filename FROM documents");
  console.log(`\nUser B sees ${userBDocs.rows.length} documents:`);
  userBDocs.rows.forEach(d => console.log(`  - ${d.filename} (id: ${d.id})`));

  // Test 3: Try to access User A's document as User B
  await setRlsContext(userB.id);
  if (userADocs.rows.length > 0) {
    const userADocId = userADocs.rows[0].id;
    // Switch context back to B, then try to read A's document
    await setRlsContext(userB.id);
    const crossAccess = await pool.query(
      "SELECT id, filename FROM documents WHERE id = $1",
      [userADocId]
    );
    console.log(`\nUser B trying to read User A's document (id: ${userADocId}):`);
    if (crossAccess.rows.length === 0) {
      console.log("  ✅ BLOCKED — RLS is working correctly");
    } else {
      console.log("  ❌ EXPOSED — RLS is NOT working");
    }
  }

  // Test 4: Confirm adminPool bypasses RLS (expected behaviour)
  const allDocs = await adminPool.query("SELECT id, filename, user_id FROM documents");
  console.log(`\nAdmin pool sees ALL ${allDocs.rows.length} documents (expected — superuser bypasses RLS)`);

  await pool.end();
  await adminPool.end();
}

testRls().catch(err => {
  console.error("Test failed:", err.message);
  process.exit(1);
});