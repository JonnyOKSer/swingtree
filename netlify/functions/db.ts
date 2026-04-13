import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }
    pool = new Pool({
      connectionString
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
  surface: string
}> = {
  // Grand Slams
  'Australian Open': { country: 'Australia', countryCode: 'AUS', city: 'Melbourne', category: 'Grand Slam', tour: 'ATP/WTA', surface: 'Hard' },
  'Roland Garros': { country: 'France', countryCode: 'FRA', city: 'Paris', category: 'Grand Slam', tour: 'ATP/WTA', surface: 'Clay' },
  'French Open': { country: 'France', countryCode: 'FRA', city: 'Paris', category: 'Grand Slam', tour: 'ATP/WTA', surface: 'Clay' },
  'Wimbledon': { country: 'United Kingdom', countryCode: 'GBR', city: 'London', category: 'Grand Slam', tour: 'ATP/WTA', surface: 'Grass' },
  'US Open': { country: 'United States of America', countryCode: 'USA', city: 'New York', category: 'Grand Slam', tour: 'ATP/WTA', surface: 'Hard' },

  // ATP Masters 1000
  'Indian Wells': { country: 'United States of America', countryCode: 'USA', city: 'Indian Wells', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Hard' },
  'Indian Wells Masters': { country: 'United States of America', countryCode: 'USA', city: 'Indian Wells', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Hard' },
  'Miami Open': { country: 'United States of America', countryCode: 'USA', city: 'Miami', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Hard' },
  'Miami Masters': { country: 'United States of America', countryCode: 'USA', city: 'Miami', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Hard' },
  'Monte-Carlo Masters': { country: 'France', countryCode: 'FRA', city: 'Monte Carlo', category: 'ATP 1000', tour: 'ATP', surface: 'Clay' },
  'Monte Carlo Masters': { country: 'France', countryCode: 'FRA', city: 'Monte Carlo', category: 'ATP 1000', tour: 'ATP', surface: 'Clay' },
  'Monte Carlo': { country: 'France', countryCode: 'FRA', city: 'Monte Carlo', category: 'ATP 1000', tour: 'ATP', surface: 'Clay' },
  'Madrid Open': { country: 'Spain', countryCode: 'ESP', city: 'Madrid', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Clay' },
  'Madrid Masters': { country: 'Spain', countryCode: 'ESP', city: 'Madrid', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Clay' },
  'Italian Open': { country: 'Italy', countryCode: 'ITA', city: 'Rome', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Clay' },
  'Rome Masters': { country: 'Italy', countryCode: 'ITA', city: 'Rome', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Clay' },
  'Rome': { country: 'Italy', countryCode: 'ITA', city: 'Rome', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Clay' },
  'Canada Masters': { country: 'Canada', countryCode: 'CAN', city: 'Toronto/Montreal', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Hard' },
  'Canadian Open': { country: 'Canada', countryCode: 'CAN', city: 'Toronto/Montreal', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Hard' },
  'Cincinnati Masters': { country: 'United States of America', countryCode: 'USA', city: 'Cincinnati', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Hard' },
  'Cincinnati': { country: 'United States of America', countryCode: 'USA', city: 'Cincinnati', category: 'ATP 1000', tour: 'ATP/WTA', surface: 'Hard' },
  'Shanghai Masters': { country: 'China', countryCode: 'CHN', city: 'Shanghai', category: 'ATP 1000', tour: 'ATP', surface: 'Hard' },
  'Shanghai': { country: 'China', countryCode: 'CHN', city: 'Shanghai', category: 'ATP 1000', tour: 'ATP', surface: 'Hard' },
  'Paris Masters': { country: 'France', countryCode: 'FRA', city: 'Paris', category: 'ATP 1000', tour: 'ATP', surface: 'Hard' },

  // ATP 500
  'Dubai Championships': { country: 'United Arab Emirates', countryCode: 'ARE', city: 'Dubai', category: 'ATP 500', tour: 'ATP/WTA', surface: 'Hard' },
  'Dubai': { country: 'United Arab Emirates', countryCode: 'ARE', city: 'Dubai', category: 'ATP 500', tour: 'ATP/WTA', surface: 'Hard' },
  'Qatar Open': { country: 'Qatar', countryCode: 'QAT', city: 'Doha', category: 'ATP 250', tour: 'ATP', surface: 'Hard' },
  'Qatar ExxonMobil Open': { country: 'Qatar', countryCode: 'QAT', city: 'Doha', category: 'ATP 250', tour: 'ATP', surface: 'Hard' },
  'Doha': { country: 'Qatar', countryCode: 'QAT', city: 'Doha', category: 'ATP 250', tour: 'ATP', surface: 'Hard' },
  'Rotterdam': { country: 'Netherlands', countryCode: 'NLD', city: 'Rotterdam', category: 'ATP 500', tour: 'ATP', surface: 'Hard' },
  'Acapulco': { country: 'Mexico', countryCode: 'MEX', city: 'Acapulco', category: 'ATP 500', tour: 'ATP/WTA', surface: 'Hard' },
  'Barcelona': { country: 'Spain', countryCode: 'ESP', city: 'Barcelona', category: 'ATP 500', tour: 'ATP', surface: 'Clay' },
  'Barcelona Open': { country: 'Spain', countryCode: 'ESP', city: 'Barcelona', category: 'ATP 500', tour: 'ATP', surface: 'Clay' },
  'Queens': { country: 'United Kingdom', countryCode: 'GBR', city: 'London', category: 'ATP 500', tour: 'ATP', surface: 'Grass' },
  "Queen's Club": { country: 'United Kingdom', countryCode: 'GBR', city: 'London', category: 'ATP 500', tour: 'ATP', surface: 'Grass' },
  'Halle': { country: 'Germany', countryCode: 'DEU', city: 'Halle', category: 'ATP 500', tour: 'ATP', surface: 'Grass' },
  'Hamburg': { country: 'Germany', countryCode: 'DEU', city: 'Hamburg', category: 'ATP 500', tour: 'ATP', surface: 'Clay' },
  'Washington': { country: 'United States of America', countryCode: 'USA', city: 'Washington D.C.', category: 'ATP 500', tour: 'ATP', surface: 'Hard' },
  'Tokyo': { country: 'Japan', countryCode: 'JPN', city: 'Tokyo', category: 'ATP 500', tour: 'ATP', surface: 'Hard' },
  'Beijing': { country: 'China', countryCode: 'CHN', city: 'Beijing', category: 'ATP 500', tour: 'ATP/WTA', surface: 'Hard' },
  'Vienna': { country: 'Austria', countryCode: 'AUT', city: 'Vienna', category: 'ATP 500', tour: 'ATP', surface: 'Hard' },
  'Basel': { country: 'Switzerland', countryCode: 'CHE', city: 'Basel', category: 'ATP 500', tour: 'ATP', surface: 'Hard' },

  // Clay Court Events (ATP 250)
  'Houston': { country: 'United States of America', countryCode: 'USA', city: 'Houston', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'U.S. Clay Court Championship': { country: 'United States of America', countryCode: 'USA', city: 'Houston', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Marrakech': { country: 'Morocco', countryCode: 'MAR', city: 'Marrakech', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Grand Prix Hassan II': { country: 'Morocco', countryCode: 'MAR', city: 'Marrakech', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Bucharest': { country: 'Romania', countryCode: 'ROU', city: 'Bucharest', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Munich': { country: 'Germany', countryCode: 'DEU', city: 'Munich', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'BMW Open': { country: 'Germany', countryCode: 'DEU', city: 'Munich', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Estoril': { country: 'Portugal', countryCode: 'PRT', city: 'Estoril', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Lyon': { country: 'France', countryCode: 'FRA', city: 'Lyon', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Geneva': { country: 'Switzerland', countryCode: 'CHE', city: 'Geneva', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Bastad': { country: 'Sweden', countryCode: 'SWE', city: 'Bastad', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Gstaad': { country: 'Switzerland', countryCode: 'CHE', city: 'Gstaad', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Kitzbuhel': { country: 'Austria', countryCode: 'AUT', city: 'Kitzbuhel', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },
  'Umag': { country: 'Croatia', countryCode: 'HRV', city: 'Umag', category: 'ATP 250', tour: 'ATP', surface: 'Clay' },

  // WTA Premier/1000 Events
  'Stuttgart': { country: 'Germany', countryCode: 'DEU', city: 'Stuttgart', category: 'WTA 500', tour: 'WTA', surface: 'Clay' },
  'Porsche Tennis Grand Prix': { country: 'Germany', countryCode: 'DEU', city: 'Stuttgart', category: 'WTA 500', tour: 'WTA', surface: 'Clay' },
  'Charleston': { country: 'United States of America', countryCode: 'USA', city: 'Charleston', category: 'WTA 500', tour: 'WTA', surface: 'Clay' },
  'Bogota': { country: 'Colombia', countryCode: 'COL', city: 'Bogota', category: 'WTA 250', tour: 'WTA', surface: 'Clay' },

  // ATP Finals
  'ATP Finals': { country: 'Italy', countryCode: 'ITA', city: 'Turin', category: 'ATP Finals', tour: 'ATP', surface: 'Hard' },
  'WTA Finals': { country: 'Saudi Arabia', countryCode: 'SAU', city: 'Riyadh', category: 'WTA Finals', tour: 'WTA', surface: 'Hard' },
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
