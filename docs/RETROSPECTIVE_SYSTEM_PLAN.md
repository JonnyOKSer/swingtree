# ASHE Post-Tournament Retrospective System - Implementation Plan

## Overview

Automated system that runs after each tournament, reconciles predictions against results, analyzes performance patterns, and generates learning signals that feed back into the model as weighted adjustments.

**Target:** Miami Open 2026 as first end-to-end retrospective

---

## Phase 1: Database Schema

**Files:** `agent/retrospective.py` (new)

Create three core tables:

```sql
-- Stores reconciled outcomes per match per tournament
CREATE TABLE retrospective_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id VARCHAR(100) NOT NULL,
    match_key VARCHAR(255) NOT NULL,
    round VARCHAR(20),
    tour VARCHAR(10),
    surface VARCHAR(20),

    -- Winner prediction
    predicted_winner VARCHAR(200),
    actual_winner VARCHAR(200),
    winner_correct BOOLEAN,

    -- First set score
    predicted_fs_score VARCHAR(10),
    actual_fs_score VARCHAR(10),
    fs_score_correct BOOLEAN,
    fs_score_delta INTEGER,
    fs_winner_correct BOOLEAN,
    miss_type VARCHAR(20),

    -- Confidence
    confidence_pct NUMERIC(5,2),
    confidence_tier VARCHAR(20),

    -- Market context
    market_implied_prob NUMERIC(5,4),
    market_edge NUMERIC(5,4),
    divergence BOOLEAN,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, match_key)
);

CREATE INDEX idx_retro_outcomes_tournament ON retrospective_outcomes(tournament_id);
CREATE INDEX idx_retro_outcomes_round ON retrospective_outcomes(round);
CREATE INDEX idx_retro_outcomes_tier ON retrospective_outcomes(confidence_tier);

-- Stores the full retrospective report per tournament
CREATE TABLE tournament_retrospectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id VARCHAR(100) UNIQUE NOT NULL,
    tournament_name VARCHAR(200),
    tour VARCHAR(10),
    surface VARCHAR(20),

    -- Aggregate stats
    total_predictions INTEGER,
    winner_accuracy NUMERIC(5,4),
    fs_score_accuracy NUMERIC(5,4),
    fs_winner_accuracy NUMERIC(5,4),
    divergence_rate NUMERIC(5,4),

    -- Detailed breakdowns (JSONB)
    overall_stats JSONB,
    by_round JSONB,
    by_tier JSONB,
    miss_analysis JSONB,
    calibration_analysis JSONB,
    learning_signals JSONB,

    -- Human readable report
    report_text TEXT,

    status VARCHAR(20) DEFAULT 'GENERATED',
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores model adjustments derived from retrospectives
CREATE TABLE model_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_retro_id UUID REFERENCES tournament_retrospectives(id),
    signal_type VARCHAR(50) NOT NULL,
    dimension VARCHAR(100) NOT NULL,
    adjustment_factor NUMERIC(6,4) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    sample_size INTEGER,
    confidence VARCHAR(20),
    description TEXT,

    applied_to_tournaments TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'ACTIVE',
    expires_after INTEGER DEFAULT 5,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_adjustments_status ON model_adjustments(status);
CREATE INDEX idx_adjustments_type ON model_adjustments(signal_type);
```

---

## Phase 2: Reconciliation Engine

**Files:** `agent/retrospective.py`

Core functions:

```python
def reconcile_tournament(tournament_id: str) -> dict:
    """
    Match all predictions to actual results for a tournament.

    1. Query prediction_log for tournament
    2. Query draw_matches for actual results
    3. Join on match_key or player names + round
    4. Compute all outcome fields
    5. Store in retrospective_outcomes
    """

def compute_outcome(prediction: dict, actual: dict) -> dict:
    """
    Compute all fields for a single prediction outcome.

    Returns:
        PredictionOutcome dict with all fields populated
    """

def classify_miss_type(predicted_fs: str, actual_fs: str) -> str:
    """
    Classify how we missed the first set score.

    Returns one of:
    - CLOSE: off by 1 game
    - MODERATE: off by 2 games
    - WRONG_SCORE: right winner, off by 3+ games
    - WRONG_WINNER: predicted wrong player to win set
    - BAGEL: 6-0 not predicted
    - TIEBREAK: tiebreak result not predicted
    """

def parse_set_score(score: str) -> tuple[int, int, str]:
    """
    Parse '6-4' into (6, 4, 'player_a') or (4, 6, 'player_b')
    Handle tiebreaks: '7-6(5)' -> (7, 6, 'player_a', tiebreak=True)
    """
```

**Join Logic:**
- Primary: match on `match_key` if both systems use same format
- Fallback: match on `tournament + round + sorted(player_a, player_b)`
- Handle name variations using existing player resolution

---

## Phase 3: Performance Analysis

**Files:** `agent/retrospective.py`

```python
def analyze_tournament(tournament_id: str) -> dict:
    """
    Compute aggregate stats from retrospective_outcomes.

    Returns:
        {
            'overall': {...},
            'by_round': {...},
            'by_tier': {...},
            'miss_analysis': {...},
            'calibration': {...}
        }
    """

def compute_overall_stats(outcomes: list) -> dict:
    """
    Total predictions, winner accuracy, FS score accuracy, etc.
    """

def compute_by_dimension(outcomes: list, dimension: str) -> dict:
    """
    Slice metrics by round, tier, surface, etc.
    """

def compute_miss_analysis(outcomes: list) -> dict:
    """
    Distribution of miss types:
    {
        'CLOSE': {'count': 42, 'pct': 0.42},
        'MODERATE': {'count': 28, 'pct': 0.28},
        ...
    }
    """

def compute_calibration(outcomes: list) -> dict:
    """
    Compare predicted confidence vs actual hit rate per tier.

    Returns:
        {
            'STRONG': {'avg_predicted': 0.87, 'actual_hit_rate': 0.83, 'delta': -0.04},
            'CONFIDENT': {...},
            ...
        }
    """
```

**Confidence Tier Definitions:**
- STRONG: 85%+
- CONFIDENT: 75-84%
- PICK: 65-74%
- LEAN: 55-64%
- SKIP: <55%

---

## Phase 4: Learning Signal Generation

**Files:** `agent/retrospective.py`

```python
SIGNAL_TYPES = [
    'CONFIDENCE_RECALIBRATION',
    'ROUND_BIAS',
    'SURFACE_BIAS',
    'TOUR_BIAS',
    'TIEBREAK_BLINDSPOT',
    'UPSET_BLINDSPOT',
    'MARKET_EDGE_VALIDATION'
]

MIN_SAMPLE_SIZE = 10

def generate_learning_signals(analysis: dict) -> list[dict]:
    """
    Analyze performance patterns and generate actionable signals.

    Only generates signals where sample_size >= MIN_SAMPLE_SIZE.
    """

def detect_calibration_signal(calibration: dict) -> list[dict]:
    """
    If a tier is consistently over/under confident, generate signal.

    Threshold: |delta| > 0.05 (5% miscalibration)
    """

def detect_round_bias(by_round: dict, baseline: float) -> list[dict]:
    """
    If a round significantly underperforms baseline, generate signal.
    """

def detect_tiebreak_blindspot(outcomes: list) -> dict | None:
    """
    If tiebreak miss rate > 70%, generate signal.
    """

def compute_signal_confidence(sample_size: int) -> str:
    """
    HIGH: n >= 30
    MEDIUM: 20 <= n < 30
    LOW: 10 <= n < 20
    """
```

---

## Phase 5: Report Generation

**Files:** `agent/retrospective.py`

```python
def generate_retrospective_report(
    tournament_id: str,
    tournament_name: str,
    analysis: dict,
    signals: list
) -> str:
    """
    Generate human-readable report text.

    Format matches the spec example:

    ASHE RETROSPECTIVE — Miami Open 2026 (ATP)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    OVERALL
      Predictions:        61
      Winner accuracy:    74% (45/61)
      ...
    """

def store_retrospective(
    tournament_id: str,
    analysis: dict,
    signals: list,
    report_text: str
) -> str:
    """
    Store in tournament_retrospectives table.
    Returns retrospective ID.
    """
```

---

## Phase 6: Model Adjustment Integration

**Files:** `agent/retrospective.py`, `model/predict.py`

```python
# In retrospective.py
def create_adjustments_from_signals(retro_id: str, signals: list) -> int:
    """
    Convert learning signals into model adjustments.
    Only creates adjustments for HIGH/MEDIUM confidence signals.
    Returns count of adjustments created.
    """

# In model/predict.py
def load_active_adjustments() -> list[dict]:
    """
    Load all ACTIVE adjustments from model_adjustments table.
    """

def apply_adjustments(
    base_confidence: float,
    context: dict  # round, surface, tour, etc.
) -> float:
    """
    Apply relevant adjustments to base confidence.

    Example: if there's a ROUND_BIAS adjustment for R128 of -0.04,
    and we're predicting an R128 match, reduce confidence by 4%.
    """

def mark_adjustment_applied(adjustment_id: str, tournament_id: str):
    """
    Track that this adjustment was applied to a tournament.
    """
```

**Adjustment Application Rules:**
- Adjustments are additive (can stack)
- Maximum total adjustment: ±15% (prevent runaway)
- Adjustments expire after N tournaments (default 5)
- Superseded when a newer signal contradicts

---

## Phase 7: Trigger Integration

**Files:** `agent/retrospective.py`, `agent/http_trigger.py`

```python
# Automatic trigger (in a cron or after reconcile)
def check_completed_tournaments():
    """
    Query for tournaments marked completed that don't have a retrospective.
    Trigger retrospective for each.
    """

# Manual trigger endpoint
@app.route('/admin/retrospective/<tournament_id>', methods=['POST'])
def trigger_retrospective(tournament_id: str):
    """
    Manually trigger a retrospective for a tournament.
    Requires admin auth.
    """
```

**Auto-trigger Logic:**
- Add to auto_reconcile or as separate cron
- Check: tournament has `status = 'completed'` AND no entry in `tournament_retrospectives`
- Run full retrospective pipeline

---

## Phase 8: Admin Dashboard (Frontend)

**Files:** `swingtree/netlify/functions/retrospective.ts`, `swingtree/src/pages/Admin.tsx`

```typescript
// API endpoint
GET /api/retrospectives              // List all retrospectives
GET /api/retrospectives/:id          // Get single retrospective
GET /api/adjustments                 // List active adjustments

// Admin page components
<RetrospectiveSelector />            // Tournament dropdown
<OverallStatsCards />                // Winner %, FS %, calibration
<RoundBreakdownTable />              // Round-by-round metrics
<MissAnalysisChart />                // Donut chart of miss types
<LearningSignalsList />              // Signals with status
<ActiveAdjustmentsPanel />           // Current model modifiers
```

---

## Implementation Order

| Phase | Priority | Estimated Effort | Dependencies |
|-------|----------|------------------|--------------|
| 1. Database Schema | P0 | Small | None |
| 2. Reconciliation Engine | P0 | Medium | Phase 1 |
| 3. Performance Analysis | P0 | Medium | Phase 2 |
| 4. Learning Signals | P1 | Medium | Phase 3 |
| 5. Report Generation | P1 | Small | Phase 3, 4 |
| 6. Model Adjustment Integration | P1 | Medium | Phase 4 |
| 7. Trigger Integration | P2 | Small | Phase 2-5 |
| 8. Admin Dashboard | P2 | Medium | Phase 5 |

**MVP (Phases 1-5):** Full retrospective generation without model feedback
**Full System (Phases 1-7):** Complete learning loop
**Polish (Phase 8):** Admin visibility

---

## File Structure

```
tennis-oracle/
├── agent/
│   ├── retrospective.py      # NEW - Core retrospective logic
│   ├── http_trigger.py       # Add /admin/retrospective endpoint
│   └── auto_reconcile.py     # Add completed tournament check
├── model/
│   └── predict.py            # Add adjustment loading/application
└── docs/
    └── RETROSPECTIVE_SYSTEM_PLAN.md

swingtree/
├── netlify/functions/
│   └── retrospective.ts      # NEW - Retrospective API
└── src/
    └── pages/
        └── Admin.tsx         # Add retrospective viewer
```

---

## Verification Checklist

- [ ] Tables created with proper indexes
- [ ] Reconciliation matches 100% of predictions to results
- [ ] Miss types correctly classified (test with known examples)
- [ ] Calibration delta computed correctly
- [ ] Signals only generated for n >= 10
- [ ] Report text renders cleanly
- [ ] Adjustments load in prediction pipeline
- [ ] Adjustments apply correctly to confidence scores
- [ ] Auto-trigger fires on tournament completion
- [ ] Admin endpoint requires auth
- [ ] Miami Open 2026 runs end-to-end successfully
