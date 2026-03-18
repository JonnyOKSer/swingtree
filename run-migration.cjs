/**
 * Run the draw sync migration via Node.js
 * Usage: node run-migration.js
 */

const { Pool } = require("pg");
const fs = require("fs");
require("dotenv").config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log("Running migration: db/setup_draw_sync.sql");

  try {
    const sql = fs.readFileSync("db/setup_draw_sync.sql", "utf8");

    // Split by semicolons but handle function definitions carefully
    // For simplicity, just execute the whole file
    await pool.query(sql);

    console.log("✅ Migration complete!");

    // Verify tables exist
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('draw_matches', 'ashe_predictions')
    `);

    console.log("Tables created:", tables.rows.map(r => r.table_name).join(", "));

  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
