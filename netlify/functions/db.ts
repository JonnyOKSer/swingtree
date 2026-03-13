import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    })
  }
  return pool
}

// Tournament metadata mapping (tournament name -> metadata)
export const TOURNAMENT_METADATA: Record<string, {
  country: string
  countryCode: string
  city: string
  category: string
  tour: string
}> = {
  // Grand Slams
  'Australian Open': { country: 'Australia', countryCode: 'AUS', city: 'Melbourne', category: 'Grand Slam', tour: 'ATP/WTA' },
  'Roland Garros': { country: 'France', countryCode: 'FRA', city: 'Paris', category: 'Grand Slam', tour: 'ATP/WTA' },
  'French Open': { country: 'France', countryCode: 'FRA', city: 'Paris', category: 'Grand Slam', tour: 'ATP/WTA' },
  'Wimbledon': { country: 'United Kingdom', countryCode: 'GBR', city: 'London', category: 'Grand Slam', tour: 'ATP/WTA' },
  'US Open': { country: 'United States of America', countryCode: 'USA', city: 'New York', category: 'Grand Slam', tour: 'ATP/WTA' },

  // ATP Masters 1000
  'Indian Wells': { country: 'United States of America', countryCode: 'USA', city: 'Indian Wells', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Indian Wells Masters': { country: 'United States of America', countryCode: 'USA', city: 'Indian Wells', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Miami Open': { country: 'United States of America', countryCode: 'USA', city: 'Miami', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Miami Masters': { country: 'United States of America', countryCode: 'USA', city: 'Miami', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Monte-Carlo Masters': { country: 'France', countryCode: 'FRA', city: 'Monte Carlo', category: 'ATP 1000', tour: 'ATP' },
  'Monte Carlo Masters': { country: 'France', countryCode: 'FRA', city: 'Monte Carlo', category: 'ATP 1000', tour: 'ATP' },
  'Madrid Open': { country: 'Spain', countryCode: 'ESP', city: 'Madrid', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Madrid Masters': { country: 'Spain', countryCode: 'ESP', city: 'Madrid', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Italian Open': { country: 'Italy', countryCode: 'ITA', city: 'Rome', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Rome Masters': { country: 'Italy', countryCode: 'ITA', city: 'Rome', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Canada Masters': { country: 'Canada', countryCode: 'CAN', city: 'Toronto/Montreal', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Cincinnati Masters': { country: 'United States of America', countryCode: 'USA', city: 'Cincinnati', category: 'ATP 1000', tour: 'ATP/WTA' },
  'Shanghai Masters': { country: 'China', countryCode: 'CHN', city: 'Shanghai', category: 'ATP 1000', tour: 'ATP' },
  'Paris Masters': { country: 'France', countryCode: 'FRA', city: 'Paris', category: 'ATP 1000', tour: 'ATP' },

  // ATP 500
  'Dubai Championships': { country: 'United Arab Emirates', countryCode: 'ARE', city: 'Dubai', category: 'ATP 500', tour: 'ATP/WTA' },
  'Dubai': { country: 'United Arab Emirates', countryCode: 'ARE', city: 'Dubai', category: 'ATP 500', tour: 'ATP/WTA' },
  'Qatar Open': { country: 'Qatar', countryCode: 'QAT', city: 'Doha', category: 'ATP 250', tour: 'ATP' },
  'Qatar ExxonMobil Open': { country: 'Qatar', countryCode: 'QAT', city: 'Doha', category: 'ATP 250', tour: 'ATP' },
  'Doha': { country: 'Qatar', countryCode: 'QAT', city: 'Doha', category: 'ATP 250', tour: 'ATP' },
  'Rotterdam': { country: 'Netherlands', countryCode: 'NLD', city: 'Rotterdam', category: 'ATP 500', tour: 'ATP' },
  'Acapulco': { country: 'Mexico', countryCode: 'MEX', city: 'Acapulco', category: 'ATP 500', tour: 'ATP/WTA' },
  'Barcelona': { country: 'Spain', countryCode: 'ESP', city: 'Barcelona', category: 'ATP 500', tour: 'ATP' },
  'Queens': { country: 'United Kingdom', countryCode: 'GBR', city: 'London', category: 'ATP 500', tour: 'ATP' },
  "Queen's Club": { country: 'United Kingdom', countryCode: 'GBR', city: 'London', category: 'ATP 500', tour: 'ATP' },
  'Halle': { country: 'Germany', countryCode: 'DEU', city: 'Halle', category: 'ATP 500', tour: 'ATP' },
  'Hamburg': { country: 'Germany', countryCode: 'DEU', city: 'Hamburg', category: 'ATP 500', tour: 'ATP' },
  'Washington': { country: 'United States of America', countryCode: 'USA', city: 'Washington D.C.', category: 'ATP 500', tour: 'ATP' },
  'Tokyo': { country: 'Japan', countryCode: 'JPN', city: 'Tokyo', category: 'ATP 500', tour: 'ATP' },
  'Beijing': { country: 'China', countryCode: 'CHN', city: 'Beijing', category: 'ATP 500', tour: 'ATP/WTA' },
  'Vienna': { country: 'Austria', countryCode: 'AUT', city: 'Vienna', category: 'ATP 500', tour: 'ATP' },
  'Basel': { country: 'Switzerland', countryCode: 'CHE', city: 'Basel', category: 'ATP 500', tour: 'ATP' },

  // ATP Finals
  'ATP Finals': { country: 'Italy', countryCode: 'ITA', city: 'Turin', category: 'ATP Finals', tour: 'ATP' },
  'WTA Finals': { country: 'Saudi Arabia', countryCode: 'SAU', city: 'Riyadh', category: 'WTA Finals', tour: 'WTA' },
}

// Convert tourney_level to category string
export function levelToCategory(level: string, tour: string): string {
  const categories: Record<string, string> = {
    'G': 'Grand Slam',
    'M': tour === 'WTA' ? 'WTA 1000' : 'ATP 1000',
    'A': tour === 'WTA' ? 'WTA 500' : 'ATP 500',
    'B': tour === 'WTA' ? 'WTA 250' : 'ATP 250',
    'F': tour === 'WTA' ? 'WTA Finals' : 'ATP Finals',
    'P': 'WTA Premier',
    'PM': 'WTA Premier Mandatory',
    'PS': 'WTA Premier 5',
    'I': 'WTA International',
  }
  return categories[level] || (tour === 'WTA' ? 'WTA' : 'ATP')
}
