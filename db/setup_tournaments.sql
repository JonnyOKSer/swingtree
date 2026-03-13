-- Tournaments reference table for stable tournament identity
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

-- Clear existing data for re-seeding
TRUNCATE tournaments RESTART IDENTITY;

-- Grand Slams (G)
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('australian-open', 'Australian Open', 'Australia', 'AUS', 'Melbourne', 'Hard', 'G', 'Grand Slam', 'ATP/WTA', 1, 128),
('roland-garros', 'Roland Garros', 'France', 'FRA', 'Paris', 'Clay', 'G', 'Grand Slam', 'ATP/WTA', 5, 128),
('wimbledon', 'Wimbledon', 'United Kingdom', 'GBR', 'London', 'Grass', 'G', 'Grand Slam', 'ATP/WTA', 7, 128),
('us-open', 'US Open', 'United States of America', 'USA', 'New York', 'Hard', 'G', 'Grand Slam', 'ATP/WTA', 8, 128);

-- ATP Masters 1000 (M)
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('indian-wells', 'Indian Wells', 'United States of America', 'USA', 'Indian Wells', 'Hard', 'M', 'ATP 1000', 'ATP/WTA', 3, 96),
('miami', 'Miami Open', 'United States of America', 'USA', 'Miami', 'Hard', 'M', 'ATP 1000', 'ATP/WTA', 3, 96),
('monte-carlo', 'Monte-Carlo Masters', 'France', 'FRA', 'Monte Carlo', 'Clay', 'M', 'ATP 1000', 'ATP', 4, 56),
('madrid', 'Madrid Open', 'Spain', 'ESP', 'Madrid', 'Clay', 'M', 'ATP 1000', 'ATP/WTA', 5, 56),
('rome', 'Italian Open', 'Italy', 'ITA', 'Rome', 'Clay', 'M', 'ATP 1000', 'ATP/WTA', 5, 56),
('canada', 'Canadian Open', 'Canada', 'CAN', 'Toronto/Montreal', 'Hard', 'M', 'ATP 1000', 'ATP/WTA', 8, 56),
('cincinnati', 'Cincinnati Masters', 'United States of America', 'USA', 'Cincinnati', 'Hard', 'M', 'ATP 1000', 'ATP/WTA', 8, 56),
('shanghai', 'Shanghai Masters', 'China', 'CHN', 'Shanghai', 'Hard', 'M', 'ATP 1000', 'ATP', 10, 56),
('paris', 'Paris Masters', 'France', 'FRA', 'Paris', 'Hard (i)', 'M', 'ATP 1000', 'ATP', 11, 48);

-- ATP 500 (A)
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('rotterdam', 'Rotterdam', 'Netherlands', 'NLD', 'Rotterdam', 'Hard (i)', 'A', 'ATP 500', 'ATP', 2, 32),
('dubai', 'Dubai Championships', 'United Arab Emirates', 'ARE', 'Dubai', 'Hard', 'A', 'ATP 500', 'ATP/WTA', 2, 32),
('acapulco', 'Acapulco', 'Mexico', 'MEX', 'Acapulco', 'Hard', 'A', 'ATP 500', 'ATP/WTA', 2, 32),
('barcelona', 'Barcelona Open', 'Spain', 'ESP', 'Barcelona', 'Clay', 'A', 'ATP 500', 'ATP', 4, 48),
('queens', 'Queens Club', 'United Kingdom', 'GBR', 'London', 'Grass', 'A', 'ATP 500', 'ATP', 6, 32),
('halle', 'Halle Open', 'Germany', 'DEU', 'Halle', 'Grass', 'A', 'ATP 500', 'ATP', 6, 32),
('hamburg', 'Hamburg Open', 'Germany', 'DEU', 'Hamburg', 'Clay', 'A', 'ATP 500', 'ATP', 7, 32),
('washington', 'Washington Open', 'United States of America', 'USA', 'Washington D.C.', 'Hard', 'A', 'ATP 500', 'ATP', 8, 32),
('tokyo', 'Japan Open', 'Japan', 'JPN', 'Tokyo', 'Hard', 'A', 'ATP 500', 'ATP', 10, 32),
('beijing', 'China Open', 'China', 'CHN', 'Beijing', 'Hard', 'A', 'ATP 500', 'ATP/WTA', 10, 32),
('vienna', 'Vienna Open', 'Austria', 'AUT', 'Vienna', 'Hard (i)', 'A', 'ATP 500', 'ATP', 10, 32),
('basel', 'Swiss Indoors', 'Switzerland', 'CHE', 'Basel', 'Hard (i)', 'A', 'ATP 500', 'ATP', 10, 32);

-- ATP 250 (B) - Selected major ones
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('brisbane', 'Brisbane International', 'Australia', 'AUS', 'Brisbane', 'Hard', 'B', 'ATP 250', 'ATP/WTA', 1, 32),
('doha', 'Qatar Open', 'Qatar', 'QAT', 'Doha', 'Hard', 'B', 'ATP 250', 'ATP', 1, 32),
('adelaide', 'Adelaide International', 'Australia', 'AUS', 'Adelaide', 'Hard', 'B', 'ATP 250', 'ATP/WTA', 1, 32),
('montpellier', 'Open Sud de France', 'France', 'FRA', 'Montpellier', 'Hard (i)', 'B', 'ATP 250', 'ATP', 2, 28),
('marseille', 'Open 13', 'France', 'FRA', 'Marseille', 'Hard (i)', 'B', 'ATP 250', 'ATP', 2, 28),
('delray-beach', 'Delray Beach Open', 'United States of America', 'USA', 'Delray Beach', 'Hard', 'B', 'ATP 250', 'ATP', 2, 28),
('s-hertogenbosch', 'Libema Open', 'Netherlands', 'NLD', 's-Hertogenbosch', 'Grass', 'B', 'ATP 250', 'ATP/WTA', 6, 28),
('eastbourne', 'Eastbourne International', 'United Kingdom', 'GBR', 'Eastbourne', 'Grass', 'B', 'ATP 250', 'ATP/WTA', 6, 28),
('atlanta', 'Atlanta Open', 'United States of America', 'USA', 'Atlanta', 'Hard', 'B', 'ATP 250', 'ATP', 7, 28),
('winston-salem', 'Winston-Salem Open', 'United States of America', 'USA', 'Winston-Salem', 'Hard', 'B', 'ATP 250', 'ATP', 8, 48),
('stockholm', 'Stockholm Open', 'Sweden', 'SWE', 'Stockholm', 'Hard (i)', 'B', 'ATP 250', 'ATP', 10, 28),
('antwerp', 'European Open', 'Belgium', 'BEL', 'Antwerp', 'Hard (i)', 'B', 'ATP 250', 'ATP', 10, 28);

-- WTA 1000 (specific WTA events)
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('doha-wta', 'Qatar TotalEnergies Open', 'Qatar', 'QAT', 'Doha', 'Hard', 'PM', 'WTA 1000', 'WTA', 2, 64),
('dubai-wta', 'Dubai Tennis Championships', 'United Arab Emirates', 'ARE', 'Dubai', 'Hard', 'PM', 'WTA 1000', 'WTA', 2, 64),
('guadalajara', 'Guadalajara Open', 'Mexico', 'MEX', 'Guadalajara', 'Hard', 'PM', 'WTA 1000', 'WTA', 9, 64),
('wuhan', 'Wuhan Open', 'China', 'CHN', 'Wuhan', 'Hard', 'PM', 'WTA 1000', 'WTA', 10, 64);

-- Tour Finals (F)
INSERT INTO tournaments (slug, name, country, country_code, city, surface, tourney_level, category, tour, typical_month, draw_size) VALUES
('atp-finals', 'ATP Finals', 'Italy', 'ITA', 'Turin', 'Hard (i)', 'F', 'ATP Finals', 'ATP', 11, 8),
('wta-finals', 'WTA Finals', 'Saudi Arabia', 'SAU', 'Riyadh', 'Hard (i)', 'F', 'WTA Finals', 'WTA', 11, 8);

-- Add name variations for matching
CREATE TABLE IF NOT EXISTS tournament_aliases (
    alias_id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(tournament_id),
    alias_name VARCHAR(200) NOT NULL,
    UNIQUE(alias_name)
);

INSERT INTO tournament_aliases (tournament_id, alias_name)
SELECT tournament_id, name FROM tournaments
UNION ALL
SELECT t.tournament_id, v.alias FROM tournaments t
CROSS JOIN (VALUES
    ('indian-wells', 'Indian Wells Masters'),
    ('indian-wells', 'BNP Paribas Open'),
    ('miami', 'Miami Masters'),
    ('monte-carlo', 'Monte Carlo Masters'),
    ('monte-carlo', 'Rolex Monte-Carlo Masters'),
    ('roland-garros', 'French Open'),
    ('rome', 'Rome Masters'),
    ('rome', 'Internazionali BNL d''Italia'),
    ('canada', 'Rogers Cup'),
    ('canada', 'National Bank Open'),
    ('cincinnati', 'Western & Southern Open'),
    ('shanghai', 'Rolex Shanghai Masters'),
    ('paris', 'Rolex Paris Masters'),
    ('queens', 'Queen''s Club Championships'),
    ('beijing', 'China Open Beijing')
) AS v(slug, alias)
WHERE t.slug = v.slug;

CREATE INDEX IF NOT EXISTS idx_tournament_aliases_name ON tournament_aliases(LOWER(alias_name));
