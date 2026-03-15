import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

async function setup() {
  const client = await pool.connect()

  try {
    console.log('Creating users table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255),
          avatar_url TEXT,
          auth_provider VARCHAR(50) NOT NULL,
          auth_provider_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          trial_start TIMESTAMP DEFAULT NOW(),
          trial_end TIMESTAMP DEFAULT NOW() + INTERVAL '7 days',
          subscription_tier VARCHAR(50) DEFAULT 'trial',
          subscription_status VARCHAR(50) DEFAULT 'trial',
          stripe_customer_id VARCHAR(255),
          stripe_subscription_id VARCHAR(255),
          is_admin BOOLEAN DEFAULT FALSE,
          comp_granted_by VARCHAR(255),
          comp_reason TEXT,
          comp_tier VARCHAR(50),
          last_login TIMESTAMP,
          login_count INTEGER DEFAULT 0
      );
    `)
    console.log('Users table created.')

    console.log('Creating access_codes table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_codes (
          id SERIAL PRIMARY KEY,
          code_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '48 hours',
          created_by VARCHAR(255),
          intended_for VARCHAR(255),
          comp_tier VARCHAR(50) DEFAULT 'tree_top',
          used_at TIMESTAMP,
          used_by INTEGER REFERENCES users(id),
          is_active BOOLEAN DEFAULT TRUE
      );
    `)
    console.log('Access codes table created.')

    console.log('Creating subscription_limits table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_limits (
          id SERIAL PRIMARY KEY,
          total_cap INTEGER DEFAULT 3000,
          current_total INTEGER DEFAULT 0
      );
    `)

    // Insert default row if not exists
    const limitsCheck = await client.query('SELECT COUNT(*) FROM subscription_limits')
    if (parseInt(limitsCheck.rows[0].count) === 0) {
      await client.query('INSERT INTO subscription_limits (total_cap, current_total) VALUES (3000, 0)')
      console.log('Subscription limits initialized with cap of 3000.')
    }
    console.log('Subscription limits table created.')

    console.log('Creating indexes...')
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_auth ON users(auth_provider, auth_provider_id);
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_codes_active ON access_codes(is_active, expires_at);
    `)
    console.log('Indexes created.')

    console.log('All auth tables created successfully!')
  } catch (err) {
    console.error('Error creating tables:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

setup()
