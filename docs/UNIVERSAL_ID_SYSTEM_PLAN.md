# Universal ID System - Complete Implementation Plan

**Status:** Planned for post-Miami Open 2025
**Created:** March 2025

## Prompt to Resume

When ready to implement, use this prompt:

```
Implement the Universal ID System as documented in docs/UNIVERSAL_ID_SYSTEM_PLAN.md.

This is a unified identification system covering:
1. Universal Tournament IDs: TOUR|YEAR|SLUG format
2. Universal Player IDs: LASTNAME-FIRSTNAME-BIRTHYEAR format
3. Universal Match IDs: Composed from tournament + round + players

Key requirements:
- Create resolver services for each ID type
- Add external_ids mapping tables for each entity
- Update draw_matches, prediction_log, and players tables
- Maintain backward compatibility during migration
- All three ID systems must work together coherently
```

---

## Overview

Create a unified identification system across three entity types that work together coherently:

| Entity | Format | Example |
|--------|--------|---------|
| Tournament | `TOUR\|YEAR\|SLUG` | `ATP\|2025\|INDIAN-WELLS` |
| Player | `LASTNAME-FIRSTNAME-BIRTHYEAR` | `SINNER-JANNIK-2001` |
| Match | `{tournament}\|{round}\|{player1}\|{player2}` | `ATP\|2025\|INDIAN-WELLS\|R32\|NADAL-RAFAEL-1986\|SINNER-JANNIK-2001` |

This enables reliable matching across all data sources: api-tennis, ESPN, Sackmann, and future integrations like The Odds API.

---

## Part 1: Universal Tournament IDs

### Format
```
TOUR|YEAR|SLUG
```

**Examples:**
- `ATP|2025|INDIAN-WELLS`
- `WTA|2025|MIAMI-OPEN`
- `ATP|2024|AUSTRALIAN-OPEN`

### Current State

**Database Tables:**
- `tournaments` - 130+ seeded tournaments with `slug`, `name`, `tour`, `category`
- `tournament_aliases` - Maps variant names to canonical slugs

**Current ID Systems by Source:**
| Source | ID Format | Example |
|--------|-----------|---------|
| api-tennis | Integer key | `2659` |
| ESPN | Numeric ID | Not stored |
| Sackmann | `tourney_name` string | `Indian Wells` |
| Internal DB | Serial `tournament_id` | `1`, `2`, `3`... |

### Schema Changes

```sql
-- Add universal_id to tournaments
ALTER TABLE tournaments
ADD COLUMN universal_id VARCHAR(100) UNIQUE;

-- External ID mapping table
CREATE TABLE tournament_external_ids (
    id SERIAL PRIMARY KEY,
    universal_id VARCHAR(100) REFERENCES tournaments(universal_id),
    source VARCHAR(50) NOT NULL,  -- 'api-tennis', 'espn', 'sackmann', 'odds-api'
    external_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source, external_id)
);

-- Backfill
UPDATE tournaments
SET universal_id = UPPER(tour) || '|' || EXTRACT(YEAR FROM CURRENT_DATE) || '|' || UPPER(slug);
```

### Resolver Service

**File:** `tennis-oracle/agent/tournament_resolver.py`

```python
class TournamentResolver:
    def resolve(self, source: str, identifier: str, year: int = None) -> str:
        """
        Resolve any tournament identifier to universal_id.

        Args:
            source: 'api-tennis', 'espn', 'sackmann', 'name'
            identifier: The source-specific ID or name
            year: Optional year (defaults to current)

        Returns:
            Universal tournament ID (e.g., 'ATP|2025|INDIAN-WELLS')
        """
        pass

    def get_external_id(self, universal_id: str, source: str) -> str:
        """Reverse lookup - get source-specific ID from universal."""
        pass
```

---

## Part 2: Universal Player IDs

### Format
```
LASTNAME-FIRSTNAME-BIRTHYEAR
```

**Examples:**
- `SINNER-JANNIK-2001`
- `NADAL-RAFAEL-1986`
- `SWIATEK-IGA-2001`

**Why this format:**
1. Human-readable
2. Handles players with same name (birth year disambiguates)
3. Stable across sources
4. Sortable (last name first)

### Current State

**Database Tables:**
- `players` - Contains `player_id` (serial), `name`, `country`, `ranking`
- No external ID mapping currently

**Current ID Systems by Source:**
| Source | ID Format | Example |
|--------|-----------|---------|
| api-tennis | Integer key | `12345` |
| ESPN | Player name | `Jannik Sinner` |
| Sackmann | Player name | `Jannik Sinner` |
| ATP/WTA | Player ID string | `S0AG` |

### Schema Changes

```sql
-- Add universal_id to players
ALTER TABLE players
ADD COLUMN universal_id VARCHAR(100) UNIQUE;

-- Add birth_year for disambiguation
ALTER TABLE players
ADD COLUMN birth_year INTEGER;

-- External ID mapping table
CREATE TABLE player_external_ids (
    id SERIAL PRIMARY KEY,
    universal_id VARCHAR(100) REFERENCES players(universal_id),
    source VARCHAR(50) NOT NULL,  -- 'api-tennis', 'espn', 'sackmann', 'atp', 'wta'
    external_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source, external_id)
);

-- Player aliases for name variations
CREATE TABLE player_aliases (
    id SERIAL PRIMARY KEY,
    universal_id VARCHAR(100) REFERENCES players(universal_id),
    alias_name VARCHAR(200) NOT NULL,
    source VARCHAR(50),  -- Where this variation was seen
    UNIQUE(alias_name, source)
);

-- Backfill example
UPDATE players
SET universal_id = UPPER(
    REGEXP_REPLACE(name, '^(.*) (.*)$', '\2-\1')  -- Swap first/last
) || '-' || COALESCE(birth_year::text, '0000');
```

### Resolver Service

**File:** `tennis-oracle/agent/player_resolver.py`

```python
class PlayerResolver:
    def resolve(self, source: str, identifier: str) -> str:
        """
        Resolve any player identifier to universal_id.

        Args:
            source: 'api-tennis', 'espn', 'sackmann', 'name'
            identifier: The source-specific ID or name

        Returns:
            Universal player ID (e.g., 'SINNER-JANNIK-2001')
        """
        pass

    def resolve_from_name(self, name: str, fuzzy: bool = True) -> str:
        """
        Resolve from display name with optional fuzzy matching.
        Handles variations like 'J. Sinner', 'Jannik SINNER', etc.
        """
        pass

    def add_alias(self, universal_id: str, alias: str, source: str):
        """Record a new name variation for future matching."""
        pass
```

### Name Normalization

```python
def normalize_player_name(name: str) -> tuple[str, str]:
    """
    Normalize various name formats to (first_name, last_name).

    Handles:
    - 'Jannik Sinner' -> ('Jannik', 'Sinner')
    - 'J. Sinner' -> ('J', 'Sinner')
    - 'SINNER J.' -> ('J', 'Sinner')
    - 'Sinner, Jannik' -> ('Jannik', 'Sinner')
    """
    pass
```

---

## Part 3: Universal Match IDs

### Format
```
{tournament_universal_id}|{round}|{player1_universal_id}|{player2_universal_id}
```

Players are sorted alphabetically by universal_id to ensure consistent ordering.

**Examples:**
- `ATP|2025|INDIAN-WELLS|R32|NADAL-RAFAEL-1986|SINNER-JANNIK-2001`
- `WTA|2025|MIAMI-OPEN|QF|SABALENKA-ARYNA-1998|SWIATEK-IGA-2001`

### Current State

**Current match_key format:**
```
{tournament_key}_{round}_{sorted_player1}_{sorted_player2}
Example: 2659_R32_nadal_sinner
```

**Problems with current format:**
1. Uses api-tennis integer (not portable)
2. Player names are lowercase slugs (inconsistent)
3. No year context for historical data

### Schema Changes

```sql
-- Add universal_match_id to draw_matches
ALTER TABLE draw_matches
ADD COLUMN universal_match_id VARCHAR(500);

CREATE INDEX idx_draw_matches_universal_match_id
ON draw_matches(universal_match_id);

-- Add to prediction_log for joining
ALTER TABLE prediction_log
ADD COLUMN universal_match_id VARCHAR(500);

CREATE INDEX idx_prediction_log_universal_match_id
ON prediction_log(universal_match_id);
```

### Match ID Builder

**File:** `tennis-oracle/agent/match_id_builder.py`

```python
class MatchIdBuilder:
    def __init__(self, tournament_resolver, player_resolver):
        self.tournament_resolver = tournament_resolver
        self.player_resolver = player_resolver

    def build(
        self,
        tournament_source: str,
        tournament_id: str,
        round: str,
        player1_name: str,
        player2_name: str,
        year: int = None
    ) -> str:
        """
        Build a universal match ID from source-specific identifiers.

        Returns:
            Universal match ID with sorted players
        """
        tournament_uid = self.tournament_resolver.resolve(
            tournament_source, tournament_id, year
        )
        player1_uid = self.player_resolver.resolve_from_name(player1_name)
        player2_uid = self.player_resolver.resolve_from_name(player2_name)

        # Sort players for consistent ordering
        sorted_players = sorted([player1_uid, player2_uid])

        return f"{tournament_uid}|{round}|{sorted_players[0]}|{sorted_players[1]}"

    def parse(self, universal_match_id: str) -> dict:
        """
        Parse a universal match ID into components.

        Returns:
            {
                'tournament_id': 'ATP|2025|INDIAN-WELLS',
                'round': 'R32',
                'player1_id': 'NADAL-RAFAEL-1986',
                'player2_id': 'SINNER-JANNIK-2001'
            }
        """
        parts = universal_match_id.split('|')
        return {
            'tournament_id': '|'.join(parts[0:3]),
            'round': parts[3],
            'player1_id': parts[4],
            'player2_id': parts[5]
        }
```

---

## Implementation Phases

### Phase 1: Database Schema (All Three)
1. Add `universal_id` columns to tournaments, players, draw_matches
2. Create external_ids mapping tables
3. Create player_aliases table
4. Add indexes

### Phase 2: Resolver Services
1. TournamentResolver with external ID lookups
2. PlayerResolver with name normalization and aliases
3. MatchIdBuilder composing the two

### Phase 3: Data Pipeline Updates

**api-tennis integration:**
- `tennis-oracle/agent/draw_sync.py`
- Resolve tournament and player IDs on ingest
- Populate universal_match_id

**Prediction pipeline:**
- `tennis-oracle/agent/predict.py`
- Use universal_match_id for prediction_log entries

**Reconciliation:**
- `tennis-oracle/agent/reconcile.py`
- Match predictions to results using universal_match_id

### Phase 4: Frontend Updates

**Files:**
- `swingtree/netlify/functions/draw.ts`
- `swingtree/netlify/functions/ticker.ts`
- `swingtree/netlify/functions/results.ts`

Changes:
- Join prediction_log to draw_matches using universal_match_id
- Simplify fuzzy matching logic (exact match on universal IDs)

### Phase 5: Backfill Existing Data
1. Populate universal_id for existing tournaments
2. Populate universal_id for existing players (may need manual birth year data)
3. Generate universal_match_id for historical draw_matches
4. Update prediction_log with universal_match_id

---

## How The Systems Work Together

### Data Ingest Flow

```
api-tennis returns match:
  tournament_key: 2659
  player1_name: "J. Sinner"
  player2_name: "R. Nadal"
  round: "R32"
          ↓
TournamentResolver:
  source='api-tennis', id='2659' → 'ATP|2025|INDIAN-WELLS'
          ↓
PlayerResolver:
  name='J. Sinner' → 'SINNER-JANNIK-2001'
  name='R. Nadal' → 'NADAL-RAFAEL-1986'
          ↓
MatchIdBuilder:
  → 'ATP|2025|INDIAN-WELLS|R32|NADAL-RAFAEL-1986|SINNER-JANNIK-2001'
          ↓
INSERT INTO draw_matches:
  universal_match_id = 'ATP|2025|INDIAN-WELLS|R32|...'
  universal_tournament_id = 'ATP|2025|INDIAN-WELLS'
  player_1_universal_id = 'SINNER-JANNIK-2001'
  player_2_universal_id = 'NADAL-RAFAEL-1986'
```

### Prediction Join Flow

```sql
-- Current (fuzzy matching nightmare)
SELECT dm.*, pl.*
FROM draw_matches dm
LEFT JOIN prediction_log pl ON (
    LOWER(dm.tournament_name) LIKE '%' || LOWER(SPLIT_PART(pl.tournament, ' ', 1)) || '%'
    AND dm.round = pl.round
    AND (player name fuzzy matching...)
)

-- With Universal IDs (exact match)
SELECT dm.*, pl.*
FROM draw_matches dm
LEFT JOIN prediction_log pl ON dm.universal_match_id = pl.universal_match_id
```

---

## Migration Strategy

1. **Add columns** - Non-breaking, additive changes
2. **Deploy resolvers** - New services, no impact
3. **Dual-write** - Write both old and new IDs
4. **Backfill** - Populate universal IDs for existing data
5. **Update reads** - Migrate queries one by one
6. **Deprecate old columns** - After verification period

---

## Verification Plan

1. **Unit tests:**
   - TournamentResolver with various source inputs
   - PlayerResolver with name variations
   - MatchIdBuilder composition

2. **Integration tests:**
   - Full pipeline: api-tennis → prediction → ticker
   - Sackmann historical import
   - ESPN ingest

3. **Manual verification:**
   - Draw Sheet loads with correct predictions
   - Ticker shows correct indicators
   - Results page stats are accurate
   - Historical data accessible

---

## Out of Scope (For Now)

- **The Odds API integration** - Not yet implemented; design accommodates future addition
- **Deep historical backfill** - Focus on 2025+ first
- **UI changes** - No user-facing ID display
- **Player birth year data collection** - May need manual/external source

---

## Key Files to Modify

### tennis-oracle (Python)
- `agent/tournament_data.py` - Add universal_id generation
- `agent/draw_sync.py` - Use resolvers on ingest
- `agent/predict.py` - Populate universal_match_id
- `agent/reconcile.py` - Match on universal_match_id
- **NEW:** `agent/tournament_resolver.py`
- **NEW:** `agent/player_resolver.py`
- **NEW:** `agent/match_id_builder.py`

### swingtree (TypeScript)
- `netlify/functions/draw.ts` - Use universal IDs
- `netlify/functions/ticker.ts` - Simplify joins
- `netlify/functions/results.ts` - Use universal IDs

### Database
- Migration scripts for all schema changes

---

## Risk Assessment

**Risk Level:** Medium-High

**Mitigations:**
- Phased rollout with dual-write period
- Extensive testing before deprecating old columns
- Resolver services provide fallback to fuzzy matching
- All changes are additive initially

**Dependencies:**
- Player birth year data needed for full universal player IDs
- May need to source from ATP/WTA official data or Sackmann
