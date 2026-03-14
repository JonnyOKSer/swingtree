-- Tournaments reference table for stable tournament identity
-- Full 2026 ATP/WTA Calendar
CREATE TABLE IF NOT EXISTS tournaments (
    tournament_id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    country VARCHAR(100) NOT NULL,
    country_code VARCHAR(3) NOT NULL,
    city VARCHAR(100) NOT NULL,
    surface VARCHAR(20) NOT NULL,
    tourney_level VARCHAR(10) NOT NULL,
    category VARCHAR(50) NOT NULL,
    tour VARCHAR(10) NOT NULL,
    typical_month INTEGER,
    draw_size INTEGER DEFAULT 32,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(slug);
CREATE INDEX IF NOT EXISTS idx_tournaments_level ON tournaments(tourney_level);
CREATE INDEX IF NOT EXISTS idx_tournaments_month ON tournaments(typical_month);

-- Clear existing data for re-seeding
TRUNCATE tournaments RESTART IDENTITY CASCADE;

-- ============================================================================
-- GRAND SLAMS (G) - 4 tournaments
-- ============================================================================
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('australian-open', 'Australian Open', 'Australia', 'AUS', 'Melbourne', 'Hard', 'G', 'Grand Slam', 'ATP/WTA', 1, 128),
('roland-garros', 'Roland Garros', 'France', 'FRA', 'Paris', 'Clay', 'G', 'Grand Slam', 'ATP/WTA', 5, 128),
('wimbledon', 'Wimbledon', 'United Kingdom', 'GBR', 'London', 'Grass', 'G', 'Grand Slam', 'ATP/WTA', 7, 128),
('us-open', 'US Open', 'United States of America', 'USA', 'New York', 'Hard', 'G', 'Grand Slam', 'ATP/WTA', 8, 128);

-- ============================================================================
-- ATP MASTERS 1000 (M) - 9 tournaments
-- ============================================================================
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('indian-wells', 'Indian Wells', 'United States of America', 'USA', 'Indian Wells', 'Hard', 'M', 'ATP 1000', 'ATP/WTA', 3, 96),
('miami', 'Miami Open', 'United States of America', 'USA', 'Miami', 'Hard', 'M', 'ATP 1000', 'ATP/WTA', 3, 96),
('monte-carlo', 'Monte-Carlo Masters', 'Monaco', 'MON', 'Monte Carlo', 'Clay', 'M', 'ATP 1000', 'ATP', 4, 56),
('madrid', 'Madrid Open', 'Spain', 'ESP', 'Madrid', 'Clay', 'M', 'ATP 1000', 'ATP/WTA', 5, 56),
('rome', 'Italian Open', 'Italy', 'ITA', 'Rome', 'Clay', 'M', 'ATP 1000', 'ATP/WTA', 5, 56),
('canada', 'Canadian Open', 'Canada', 'CAN', 'Toronto/Montreal', 'Hard', 'M', 'ATP 1000', 'ATP/WTA', 8, 56),
('cincinnati', 'Cincinnati Masters', 'United States of America', 'USA', 'Cincinnati', 'Hard', 'M', 'ATP 1000', 'ATP/WTA', 8, 56),
('shanghai', 'Shanghai Masters', 'China', 'CHN', 'Shanghai', 'Hard', 'M', 'ATP 1000', 'ATP', 10, 56),
('paris', 'Paris Masters', 'France', 'FRA', 'Paris', 'Hard (i)', 'M', 'ATP 1000', 'ATP', 11, 48);

-- ============================================================================
-- ATP 500 (A) - 13 tournaments
-- ============================================================================
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('rotterdam', 'ABN AMRO Open', 'Netherlands', 'NLD', 'Rotterdam', 'Hard (i)', 'A', 'ATP 500', 'ATP', 2, 32),
('rio', 'Rio Open', 'Brazil', 'BRA', 'Rio de Janeiro', 'Clay', 'A', 'ATP 500', 'ATP', 2, 32),
('dubai', 'Dubai Championships', 'United Arab Emirates', 'ARE', 'Dubai', 'Hard', 'A', 'ATP 500', 'ATP', 2, 32),
('acapulco', 'Acapulco Open', 'Mexico', 'MEX', 'Acapulco', 'Hard', 'A', 'ATP 500', 'ATP/WTA', 2, 32),
('barcelona', 'Barcelona Open', 'Spain', 'ESP', 'Barcelona', 'Clay', 'A', 'ATP 500', 'ATP', 4, 48),
('queens', 'Queens Club Championships', 'United Kingdom', 'GBR', 'London', 'Grass', 'A', 'ATP 500', 'ATP', 6, 32),
('halle', 'Halle Open', 'Germany', 'DEU', 'Halle', 'Grass', 'A', 'ATP 500', 'ATP', 6, 32),
('hamburg', 'Hamburg Open', 'Germany', 'DEU', 'Hamburg', 'Clay', 'A', 'ATP 500', 'ATP', 7, 32),
('washington', 'Washington Open', 'United States of America', 'USA', 'Washington D.C.', 'Hard', 'A', 'ATP 500', 'ATP', 8, 32),
('tokyo', 'Japan Open', 'Japan', 'JPN', 'Tokyo', 'Hard', 'A', 'ATP 500', 'ATP', 10, 32),
('beijing', 'China Open', 'China', 'CHN', 'Beijing', 'Hard', 'A', 'ATP 500', 'ATP/WTA', 10, 32),
('vienna', 'Erste Bank Open', 'Austria', 'AUT', 'Vienna', 'Hard (i)', 'A', 'ATP 500', 'ATP', 10, 32),
('basel', 'Swiss Indoors', 'Switzerland', 'CHE', 'Basel', 'Hard (i)', 'A', 'ATP 500', 'ATP', 10, 32);

-- ============================================================================
-- ATP 250 (B) - Full 2026 calendar (~40 tournaments)
-- ============================================================================
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
-- January
('brisbane', 'Brisbane International', 'Australia', 'AUS', 'Brisbane', 'Hard', 'B', 'ATP 250', 'ATP/WTA', 1, 32),
('hong-kong', 'Hong Kong Open', 'Hong Kong', 'HKG', 'Hong Kong', 'Hard', 'B', 'ATP 250', 'ATP', 1, 28),
('auckland', 'Auckland Open', 'New Zealand', 'NZL', 'Auckland', 'Hard', 'B', 'ATP 250', 'ATP/WTA', 1, 28),
('adelaide', 'Adelaide International', 'Australia', 'AUS', 'Adelaide', 'Hard', 'B', 'ATP 250', 'ATP/WTA', 1, 32),

-- February
('montpellier', 'Open Sud de France', 'France', 'FRA', 'Montpellier', 'Hard (i)', 'B', 'ATP 250', 'ATP', 2, 28),
('dallas', 'Dallas Open', 'United States of America', 'USA', 'Dallas', 'Hard (i)', 'B', 'ATP 250', 'ATP', 2, 28),
('cordoba', 'Cordoba Open', 'Argentina', 'ARG', 'Cordoba', 'Clay', 'B', 'ATP 250', 'ATP', 2, 28),
('marseille', 'Open 13', 'France', 'FRA', 'Marseille', 'Hard (i)', 'B', 'ATP 250', 'ATP', 2, 28),
('delray-beach', 'Delray Beach Open', 'United States of America', 'USA', 'Delray Beach', 'Hard', 'B', 'ATP 250', 'ATP', 2, 28),
('buenos-aires', 'Argentina Open', 'Argentina', 'ARG', 'Buenos Aires', 'Clay', 'B', 'ATP 250', 'ATP', 2, 28),
('doha', 'Qatar ExxonMobil Open', 'Qatar', 'QAT', 'Doha', 'Hard', 'B', 'ATP 250', 'ATP', 2, 28),
('santiago', 'Chile Open', 'Chile', 'CHL', 'Santiago', 'Clay', 'B', 'ATP 250', 'ATP', 2, 28),

-- March
('los-cabos', 'Los Cabos Open', 'Mexico', 'MEX', 'Los Cabos', 'Hard', 'B', 'ATP 250', 'ATP', 3, 28),

-- April
('marrakech', 'Grand Prix Hassan II', 'Morocco', 'MAR', 'Marrakech', 'Clay', 'B', 'ATP 250', 'ATP', 4, 28),
('houston', 'US Clay Court Championships', 'United States of America', 'USA', 'Houston', 'Clay', 'B', 'ATP 250', 'ATP', 4, 28),
('bucharest', 'Bucharest Open', 'Romania', 'ROU', 'Bucharest', 'Clay', 'B', 'ATP 250', 'ATP', 4, 28),
('estoril', 'Estoril Open', 'Portugal', 'PRT', 'Estoril', 'Clay', 'B', 'ATP 250', 'ATP', 4, 28),
('munich', 'BMW Open', 'Germany', 'DEU', 'Munich', 'Clay', 'B', 'ATP 250', 'ATP', 4, 28),

-- May
('geneva', 'Geneva Open', 'Switzerland', 'CHE', 'Geneva', 'Clay', 'B', 'ATP 250', 'ATP', 5, 28),
('lyon', 'Lyon Open', 'France', 'FRA', 'Lyon', 'Clay', 'B', 'ATP 250', 'ATP', 5, 28),

-- June
('s-hertogenbosch', 'Libema Open', 'Netherlands', 'NLD', 's-Hertogenbosch', 'Grass', 'B', 'ATP 250', 'ATP/WTA', 6, 28),
('stuttgart', 'Stuttgart Open', 'Germany', 'DEU', 'Stuttgart', 'Grass', 'B', 'ATP 250', 'ATP', 6, 28),
('eastbourne', 'Eastbourne International', 'United Kingdom', 'GBR', 'Eastbourne', 'Grass', 'B', 'ATP 250', 'ATP/WTA', 6, 28),
('mallorca', 'Mallorca Championships', 'Spain', 'ESP', 'Mallorca', 'Grass', 'B', 'ATP 250', 'ATP', 6, 28),

-- July
('newport', 'Hall of Fame Open', 'United States of America', 'USA', 'Newport', 'Grass', 'B', 'ATP 250', 'ATP', 7, 28),
('bastad', 'Nordea Open', 'Sweden', 'SWE', 'Bastad', 'Clay', 'B', 'ATP 250', 'ATP', 7, 28),
('gstaad', 'Swiss Open', 'Switzerland', 'CHE', 'Gstaad', 'Clay', 'B', 'ATP 250', 'ATP', 7, 28),
('umag', 'Croatia Open', 'Croatia', 'HRV', 'Umag', 'Clay', 'B', 'ATP 250', 'ATP', 7, 28),
('atlanta', 'Atlanta Open', 'United States of America', 'USA', 'Atlanta', 'Hard', 'B', 'ATP 250', 'ATP', 7, 28),
('kitzbuhel', 'Generali Open', 'Austria', 'AUT', 'Kitzbuhel', 'Clay', 'B', 'ATP 250', 'ATP', 7, 28),

-- August
('los-cabos-aug', 'Mifel Open', 'Mexico', 'MEX', 'Los Cabos', 'Hard', 'B', 'ATP 250', 'ATP', 8, 28),
('winston-salem', 'Winston-Salem Open', 'United States of America', 'USA', 'Winston-Salem', 'Hard', 'B', 'ATP 250', 'ATP', 8, 48),

-- September
('chengdu', 'Chengdu Open', 'China', 'CHN', 'Chengdu', 'Hard', 'B', 'ATP 250', 'ATP', 9, 28),
('hangzhou', 'Hangzhou Open', 'China', 'CHN', 'Hangzhou', 'Hard', 'B', 'ATP 250', 'ATP', 9, 28),

-- October
('almaty', 'Astana Open', 'Kazakhstan', 'KAZ', 'Almaty', 'Hard (i)', 'B', 'ATP 250', 'ATP', 10, 28),
('stockholm', 'Stockholm Open', 'Sweden', 'SWE', 'Stockholm', 'Hard (i)', 'B', 'ATP 250', 'ATP', 10, 28),
('antwerp', 'European Open', 'Belgium', 'BEL', 'Antwerp', 'Hard (i)', 'B', 'ATP 250', 'ATP', 10, 28),
('sofia', 'Sofia Open', 'Bulgaria', 'BGR', 'Sofia', 'Hard (i)', 'B', 'ATP 250', 'ATP', 10, 28),

-- November
('metz', 'Moselle Open', 'France', 'FRA', 'Metz', 'Hard (i)', 'B', 'ATP 250', 'ATP', 11, 28),
('belgrade', 'Belgrade Open', 'Serbia', 'SRB', 'Belgrade', 'Hard (i)', 'B', 'ATP 250', 'ATP', 11, 28);

-- ============================================================================
-- WTA 1000 (PM) - 10 tournaments
-- ============================================================================
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('doha-wta', 'Qatar TotalEnergies Open', 'Qatar', 'QAT', 'Doha', 'Hard', 'PM', 'WTA 1000', 'WTA', 2, 64),
('dubai-wta', 'Dubai Tennis Championships', 'United Arab Emirates', 'ARE', 'Dubai', 'Hard', 'PM', 'WTA 1000', 'WTA', 2, 64),
('charleston', 'Charleston Open', 'United States of America', 'USA', 'Charleston', 'Clay', 'PM', 'WTA 1000', 'WTA', 4, 56),
('berlin', 'Berlin Open', 'Germany', 'DEU', 'Berlin', 'Grass', 'PM', 'WTA 1000', 'WTA', 6, 32),
('toronto-wta', 'Canadian Open', 'Canada', 'CAN', 'Toronto', 'Hard', 'PM', 'WTA 1000', 'WTA', 8, 56),
('san-diego', 'San Diego Open', 'United States of America', 'USA', 'San Diego', 'Hard', 'PM', 'WTA 1000', 'WTA', 9, 56),
('guadalajara', 'Guadalajara Open', 'Mexico', 'MEX', 'Guadalajara', 'Hard', 'PM', 'WTA 1000', 'WTA', 9, 64),
('beijing-wta', 'China Open', 'China', 'CHN', 'Beijing', 'Hard', 'PM', 'WTA 1000', 'WTA', 10, 64),
('wuhan', 'Wuhan Open', 'China', 'CHN', 'Wuhan', 'Hard', 'PM', 'WTA 1000', 'WTA', 10, 64);

-- ============================================================================
-- WTA 500 (P5) - 11 tournaments
-- ============================================================================
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('adelaide-wta', 'Adelaide International', 'Australia', 'AUS', 'Adelaide', 'Hard', 'P5', 'WTA 500', 'WTA', 1, 32),
('linz', 'Upper Austria Ladies', 'Austria', 'AUT', 'Linz', 'Hard (i)', 'P5', 'WTA 500', 'WTA', 2, 32),
('abu-dhabi-wta', 'Abu Dhabi Open', 'United Arab Emirates', 'ARE', 'Abu Dhabi', 'Hard', 'P5', 'WTA 500', 'WTA', 2, 32),
('stuttgart-wta', 'Stuttgart Open', 'Germany', 'DEU', 'Stuttgart', 'Clay (i)', 'P5', 'WTA 500', 'WTA', 4, 28),
('strasbourg', 'Strasbourg International', 'France', 'FRA', 'Strasbourg', 'Clay', 'P5', 'WTA 500', 'WTA', 5, 32),
('nottingham', 'Rothesay Open', 'United Kingdom', 'GBR', 'Nottingham', 'Grass', 'P5', 'WTA 500', 'WTA', 6, 32),
('san-jose-wta', 'Mubadala Silicon Valley', 'United States of America', 'USA', 'San Jose', 'Hard', 'P5', 'WTA 500', 'WTA', 8, 32),
('seoul', 'Korea Open', 'South Korea', 'KOR', 'Seoul', 'Hard', 'P5', 'WTA 500', 'WTA', 9, 32),
('tokyo-wta', 'Toray Pan Pacific Open', 'Japan', 'JPN', 'Tokyo', 'Hard (i)', 'P5', 'WTA 500', 'WTA', 10, 32),
('ningbo', 'Ningbo Open', 'China', 'CHN', 'Ningbo', 'Hard', 'P5', 'WTA 500', 'WTA', 10, 32);

-- ============================================================================
-- WTA 250 (P2) - Major events (~30 tournaments)
-- ============================================================================
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
-- January
('hobart', 'Hobart International', 'Australia', 'AUS', 'Hobart', 'Hard', 'P2', 'WTA 250', 'WTA', 1, 32),

-- February
('hua-hin', 'Thailand Open', 'Thailand', 'THA', 'Hua Hin', 'Hard', 'P2', 'WTA 250', 'WTA', 2, 32),
('austin', 'ATX Open', 'United States of America', 'USA', 'Austin', 'Hard', 'P2', 'WTA 250', 'WTA', 2, 32),
('san-diego-wta-250', 'San Diego Open', 'United States of America', 'USA', 'San Diego', 'Hard', 'P2', 'WTA 250', 'WTA', 2, 32),
('cluj', 'Transylvania Open', 'Romania', 'ROU', 'Cluj-Napoca', 'Hard (i)', 'P2', 'WTA 250', 'WTA', 2, 32),

-- March
('monterrey', 'Monterrey Open', 'Mexico', 'MEX', 'Monterrey', 'Hard', 'P2', 'WTA 250', 'WTA', 3, 32),
('indian-wells-qual', 'Indian Wells Qualifying', 'United States of America', 'USA', 'Indian Wells', 'Hard', 'P2', 'WTA 250', 'WTA', 3, 64),

-- April
('bogota', 'Copa Colsanitas', 'Colombia', 'COL', 'Bogota', 'Clay', 'P2', 'WTA 250', 'WTA', 4, 32),
('rouen', 'Rouen Open', 'France', 'FRA', 'Rouen', 'Clay (i)', 'P2', 'WTA 250', 'WTA', 4, 32),
('parma', 'Parma Ladies Open', 'Italy', 'ITA', 'Parma', 'Clay', 'P2', 'WTA 250', 'WTA', 5, 32),

-- May
('rabat', 'Grand Prix SAR La Princesse', 'Morocco', 'MAR', 'Rabat', 'Clay', 'P2', 'WTA 250', 'WTA', 5, 32),

-- June
('birmingham', 'Rothesay Classic', 'United Kingdom', 'GBR', 'Birmingham', 'Grass', 'P2', 'WTA 250', 'WTA', 6, 32),
('bad-homburg', 'Bad Homburg Open', 'Germany', 'DEU', 'Bad Homburg', 'Grass', 'P2', 'WTA 250', 'WTA', 6, 32),

-- July
('budapest', 'Hungarian Grand Prix', 'Hungary', 'HUN', 'Budapest', 'Clay', 'P2', 'WTA 250', 'WTA', 7, 32),
('lausanne', 'Ladies Open Lausanne', 'Switzerland', 'CHE', 'Lausanne', 'Clay', 'P2', 'WTA 250', 'WTA', 7, 32),
('palermo', 'Palermo Ladies Open', 'Italy', 'ITA', 'Palermo', 'Clay', 'P2', 'WTA 250', 'WTA', 7, 32),
('prague', 'Prague Open', 'Czech Republic', 'CZE', 'Prague', 'Clay', 'P2', 'WTA 250', 'WTA', 7, 32),
('iasi', 'Iasi Open', 'Romania', 'ROU', 'Iasi', 'Clay', 'P2', 'WTA 250', 'WTA', 7, 32),

-- August
('washington-wta', 'Mubadala Citi DC Open', 'United States of America', 'USA', 'Washington D.C.', 'Hard', 'P2', 'WTA 250', 'WTA', 8, 32),
('cleveland', 'Tennis in the Land', 'United States of America', 'USA', 'Cleveland', 'Hard', 'P2', 'WTA 250', 'WTA', 8, 32),
('monterrey-aug', 'Monterrey Open', 'Mexico', 'MEX', 'Monterrey', 'Hard', 'P2', 'WTA 250', 'WTA', 8, 32),

-- September
('monastir', 'Jasmin Open', 'Tunisia', 'TUN', 'Monastir', 'Hard', 'P2', 'WTA 250', 'WTA', 9, 32),
('hua-hin-sep', 'Thailand Open', 'Thailand', 'THA', 'Hua Hin', 'Hard', 'P2', 'WTA 250', 'WTA', 9, 32),

-- October
('osaka', 'Kinoshita Open', 'Japan', 'JPN', 'Osaka', 'Hard', 'P2', 'WTA 250', 'WTA', 10, 32),
('guangzhou', 'Guangzhou Open', 'China', 'CHN', 'Guangzhou', 'Hard', 'P2', 'WTA 250', 'WTA', 10, 32),
('jiujiang', 'Jiujiang Open', 'China', 'CHN', 'Jiujiang', 'Hard', 'P2', 'WTA 250', 'WTA', 10, 32),
('nanchang', 'Nanchang Open', 'China', 'CHN', 'Nanchang', 'Hard', 'P2', 'WTA 250', 'WTA', 10, 32),
('merida', 'Merida Open', 'Mexico', 'MEX', 'Merida', 'Hard', 'P2', 'WTA 250', 'WTA', 10, 32),
('hong-kong-wta', 'Hong Kong Open', 'Hong Kong', 'HKG', 'Hong Kong', 'Hard', 'P2', 'WTA 250', 'WTA', 10, 32);

-- ============================================================================
-- TOUR FINALS (F)
-- ============================================================================
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('atp-finals', 'Nitto ATP Finals', 'Italy', 'ITA', 'Turin', 'Hard (i)', 'F', 'ATP Finals', 'ATP', 11, 8),
('wta-finals', 'WTA Finals', 'Saudi Arabia', 'SAU', 'Riyadh', 'Hard (i)', 'F', 'WTA Finals', 'WTA', 11, 8),
('next-gen-finals', 'Next Gen ATP Finals', 'Saudi Arabia', 'SAU', 'Jeddah', 'Hard (i)', 'F', 'Next Gen Finals', 'ATP', 12, 8);

-- ============================================================================
-- Tournament Aliases for name matching
-- ============================================================================
DROP TABLE IF EXISTS tournament_aliases CASCADE;
CREATE TABLE IF NOT EXISTS tournament_aliases (
    alias_id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(tournament_id),
    alias_name VARCHAR(200) NOT NULL,
    UNIQUE(alias_name)
);

-- Insert tournament names as aliases
INSERT INTO tournament_aliases (tournament_id, alias_name)
SELECT tournament_id, name FROM tournaments;

-- Insert common alternative names
INSERT INTO tournament_aliases (tournament_id, alias_name)
SELECT t.tournament_id, v.alias FROM tournaments t
CROSS JOIN (VALUES
    -- Grand Slams
    ('australian-open', 'AO'),
    ('australian-open', 'Happy Slam'),
    ('roland-garros', 'French Open'),
    ('roland-garros', 'RG'),
    ('wimbledon', 'The Championships'),
    ('wimbledon', 'SW19'),
    ('us-open', 'USO'),
    ('us-open', 'Flushing Meadows'),

    -- ATP Masters 1000
    ('indian-wells', 'Indian Wells Masters'),
    ('indian-wells', 'BNP Paribas Open'),
    ('indian-wells', 'IW'),
    ('miami', 'Miami Masters'),
    ('miami', 'Miami Open presented by Itau'),
    ('monte-carlo', 'Monte Carlo Masters'),
    ('monte-carlo', 'Rolex Monte-Carlo Masters'),
    ('monte-carlo', 'Monaco'),
    ('madrid', 'Mutua Madrid Open'),
    ('rome', 'Rome Masters'),
    ('rome', 'Internazionali BNL d''Italia'),
    ('rome', 'Italian Open'),
    ('canada', 'Rogers Cup'),
    ('canada', 'National Bank Open'),
    ('canada', 'Toronto Masters'),
    ('canada', 'Montreal Masters'),
    ('cincinnati', 'Western & Southern Open'),
    ('cincinnati', 'Cincy'),
    ('shanghai', 'Rolex Shanghai Masters'),
    ('paris', 'Rolex Paris Masters'),
    ('paris', 'Paris-Bercy'),

    -- ATP 500
    ('rotterdam', 'Rotterdam Open'),
    ('rotterdam', 'ABN AMRO World Tennis Tournament'),
    ('dubai', 'Dubai Duty Free'),
    ('acapulco', 'Abierto Mexicano'),
    ('acapulco', 'Mexican Open'),
    ('barcelona', 'Conde de Godo'),
    ('barcelona', 'Trofeo Conde de Godo'),
    ('queens', 'Queen''s Club'),
    ('queens', 'Cinch Championships'),
    ('halle', 'Terra Wortmann Open'),
    ('hamburg', 'German Open'),
    ('washington', 'Citi Open'),
    ('tokyo', 'Rakuten Japan Open'),
    ('beijing', 'China Open'),
    ('vienna', 'Vienna Open'),
    ('basel', 'Swiss Indoors Basel'),

    -- WTA 1000
    ('doha-wta', 'Qatar Open WTA'),
    ('dubai-wta', 'Dubai WTA'),
    ('charleston', 'Volvo Car Open'),
    ('toronto-wta', 'Canadian Open WTA'),
    ('beijing-wta', 'China Open WTA'),

    -- Tour Finals
    ('atp-finals', 'ATP Tour Finals'),
    ('atp-finals', 'Year-End Championships'),
    ('wta-finals', 'WTA Tour Championships')
) AS v(slug, alias)
WHERE t.slug = v.slug
ON CONFLICT (alias_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_tournament_aliases_name ON tournament_aliases(LOWER(alias_name));

-- ============================================================================
-- Draw entries table for storing bracket data
-- ============================================================================
CREATE TABLE IF NOT EXISTS tournament_draws (
    draw_id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(tournament_id),
    year INTEGER NOT NULL,
    draw_date DATE,
    draw_json JSONB,
    entries_count INTEGER,
    seeds_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, year)
);

CREATE INDEX IF NOT EXISTS idx_tournament_draws_year ON tournament_draws(year);
