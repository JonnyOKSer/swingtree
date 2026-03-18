-- ============================================================================
-- ASHE Draw/Prediction Sync Schema
-- Decoupled storage for api-tennis.com draw data and ASHE predictions
-- ============================================================================

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS ashe_predictions CASCADE;
DROP TABLE IF EXISTS draw_matches CASCADE;

-- ============================================================================
-- draw_matches: Source of truth for tournament bracket data from api-tennis.com
-- ============================================================================
CREATE TABLE draw_matches (
    match_key VARCHAR(255) PRIMARY KEY,  -- Stable join key: {tournament_key}_{round}_{lo_player}_{hi_player}

    -- Tournament context
    tournament_key INTEGER NOT NULL,
    tournament_name VARCHAR(255) NOT NULL,
    tour VARCHAR(10),  -- ATP, WTA, etc.

    -- Round info
    round_raw VARCHAR(255),      -- Original string from api-tennis (e.g., "ATP Miami - 1/64-finals")
    round_normalized VARCHAR(10) NOT NULL,  -- ASHE standard: R128, R64, R32, R16, QF, SF, F

    -- Players
    player_1_key INTEGER NOT NULL,
    player_1_name VARCHAR(255) NOT NULL,
    player_2_key INTEGER NOT NULL,
    player_2_name VARCHAR(255) NOT NULL,

    -- Schedule & status
    scheduled_date DATE,
    scheduled_time TIME,
    event_key INTEGER,  -- api-tennis event_key for updates
    status VARCHAR(20) DEFAULT 'upcoming',  -- upcoming, live, finished

    -- Result (populated after match completes)
    winner_key INTEGER,
    winner_name VARCHAR(255),
    final_result VARCHAR(50),  -- e.g., "6-4 6-3"

    -- Sync metadata
    draw_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_draw_matches_tournament ON draw_matches(tournament_key);
CREATE INDEX idx_draw_matches_round ON draw_matches(round_normalized);
CREATE INDEX idx_draw_matches_status ON draw_matches(status);
CREATE INDEX idx_draw_matches_date ON draw_matches(scheduled_date);
CREATE INDEX idx_draw_matches_players ON draw_matches(player_1_key, player_2_key);

-- ============================================================================
-- ashe_predictions: ASHE model predictions, may arrive before or after draw
-- ============================================================================
CREATE TABLE ashe_predictions (
    id SERIAL PRIMARY KEY,

    -- Join key (nullable - predictions may arrive before draw)
    match_key VARCHAR(255) REFERENCES draw_matches(match_key) ON DELETE SET NULL,

    -- Tournament context (stored for orphan resolution)
    tournament_key INTEGER NOT NULL,
    tournament_name VARCHAR(255),
    tour VARCHAR(10),

    -- Match context (stored for orphan resolution when match_key is null)
    round_normalized VARCHAR(10) NOT NULL,
    player_1_key INTEGER NOT NULL,
    player_1_name VARCHAR(255),
    player_2_key INTEGER NOT NULL,
    player_2_name VARCHAR(255),

    -- Prediction
    predicted_winner_key INTEGER NOT NULL,
    predicted_winner_name VARCHAR(255) NOT NULL,
    confidence_pct DECIMAL(5,2) NOT NULL,  -- 0.00 to 100.00
    confidence_tier VARCHAR(20) NOT NULL,  -- STRONG, CONFIDENT, PICK, LEAN, SKIP

    -- First set prediction
    first_set_winner_key INTEGER,
    first_set_winner_name VARCHAR(255),
    first_set_score VARCHAR(10),  -- e.g., "6-4"

    -- Market data (from The Odds API, optional)
    market_implied_prob DECIMAL(5,2),  -- Market probability for predicted winner
    market_edge DECIMAL(5,2),          -- ASHE prob - market prob

    -- Timing
    predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Result (populated after reconciliation)
    result VARCHAR(20),  -- NULL (pending), correct, incorrect
    result_first_set VARCHAR(20),  -- NULL, correct, incorrect
    reconciled_at TIMESTAMP WITH TIME ZONE,

    -- Orphan tracking
    orphan_logged_at TIMESTAMP WITH TIME ZONE,  -- When orphan was first detected

    -- Constraints
    UNIQUE (tournament_key, round_normalized, player_1_key, player_2_key)
);

-- Indexes for common queries
CREATE INDEX idx_predictions_match_key ON ashe_predictions(match_key);
CREATE INDEX idx_predictions_tournament ON ashe_predictions(tournament_key);
CREATE INDEX idx_predictions_orphans ON ashe_predictions(match_key) WHERE match_key IS NULL;
CREATE INDEX idx_predictions_unreconciled ON ashe_predictions(result) WHERE result IS NULL;
CREATE INDEX idx_predictions_date ON ashe_predictions(predicted_at);
CREATE INDEX idx_predictions_tier ON ashe_predictions(confidence_tier);

-- ============================================================================
-- Helper function: Update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_draw_matches_updated_at
    BEFORE UPDATE ON draw_matches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- View: Unified drawsheet view (draw + predictions joined)
-- ============================================================================
CREATE OR REPLACE VIEW drawsheet_view AS
SELECT
    dm.match_key,
    dm.tournament_key,
    dm.tournament_name,
    dm.tour,
    dm.round_raw,
    dm.round_normalized,
    dm.player_1_key,
    dm.player_1_name,
    dm.player_2_key,
    dm.player_2_name,
    dm.scheduled_date,
    dm.scheduled_time,
    dm.status AS match_status,
    dm.winner_key AS actual_winner_key,
    dm.winner_name AS actual_winner_name,
    dm.final_result,
    -- Prediction data
    ap.id AS prediction_id,
    ap.predicted_winner_key,
    ap.predicted_winner_name,
    ap.confidence_pct,
    ap.confidence_tier,
    ap.first_set_winner_key,
    ap.first_set_winner_name,
    ap.first_set_score AS predicted_first_set_score,
    ap.market_implied_prob,
    ap.market_edge,
    ap.predicted_at,
    ap.result AS prediction_result,
    ap.result_first_set,
    ap.reconciled_at,
    -- Derived status
    CASE
        WHEN ap.id IS NULL THEN 'pending'
        ELSE 'available'
    END AS prediction_status
FROM draw_matches dm
LEFT JOIN ashe_predictions ap ON dm.match_key = ap.match_key;

-- ============================================================================
-- Migration complete
-- ============================================================================
