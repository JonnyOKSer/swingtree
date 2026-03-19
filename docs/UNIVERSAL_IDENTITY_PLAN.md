# Universal Identity System - Implementation Plan

## Timeline

**Target Implementation:** After Miami Open 2026 (late March/early April)

**Rationale:** Avoid disrupting the live production system during an active major tournament. Miami Open is a combined ATP/WTA 1000 event with high traffic.

---

## Part 1: Universal Tournament ID System

### Overview

Create a unified tournament identification system using the format `TOUR|YEAR|SLUG` (e.g., `ATP|2025|INDIAN-WELLS`) to reliably match tournaments across all data sources: api-tennis, ESPN, Sackmann, and future integrations like The Odds API.

### Current State (Research Findings)

**Database Tables:**
- `tournaments` - 130+ seeded tournaments with `slug`, `name`, `tour`, `category`
- `tournament_aliases` - Maps variant names to canonical slugs (e.g., "BNP Paribas Open" → "indian-wells")
- `draw_matches` - Uses `tournament_key` (api-tennis integer) + `tournament_name`

**Current ID Systems:**
| Source | ID Format | Example |
|--------|-----------|---------|
| api-tennis | Integer key | `2659` |
| ESPN | Numeric ID | Not stored |
| Sackmann | `tourney_name` string | `Indian Wells` |
| Internal DB | Serial `tournament_id` | `1`, `2`, `3`... |

**Key Files:**
- `tennis-oracle/agent/tournament_data.py` - Tournament seeding, aliases
- `tennis-oracle/agent/espn_ingest.py` - ESPN scraping with TOURNAMENT_NAME_MAP
- `tennis-oracle/agent/sackmann.py` - Historical data import
- `swingtree/netlify/functions/draw.ts` - Draw API using slugs

### Current Match Key Format
```
{tournament_key}_{round}_{sorted_player1}_{sorted_player2}
Example: 2659_R32_nadal_sinner
```

### Proposed Universal Tournament ID Format

```
TOUR|YEAR|SLUG
```

**Examples:**
- `ATP|2026|INDIAN-WELLS`
- `WTA|2026|MIAMI-OPEN`
- `ATP|2025|AUSTRALIAN-OPEN`

**Benefits:**
1. Human-readable and debuggable
2. Year-aware for historical data
3. Tour-scoped to handle ATP/WTA events at same venue
4. Matches existing slug infrastructure

### Tournament Implementation Phases

#### Phase T1: Database Schema Migration

**File:** `tennis-oracle/agent/tournament_data.py`

Add new column to `tournaments` table:
```sql
ALTER TABLE tournaments
ADD COLUMN universal_id VARCHAR(100) UNIQUE;

-- Backfill existing tournaments
UPDATE tournaments
SET universal_id = UPPER(tour) || '|' || EXTRACT(YEAR FROM CURRENT_DATE) || '|' || UPPER(slug);
```

Add mapping table for external IDs:
```sql
CREATE TABLE tournament_external_ids (
    id SERIAL PRIMARY KEY,
    universal_id VARCHAR(100) REFERENCES tournaments(universal_id),
    source VARCHAR(50) NOT NULL,  -- 'api-tennis', 'espn', 'sackmann', 'odds-api'
    external_id VARCHAR(100) NOT NULL,
    UNIQUE(source, external_id)
);
```

#### Phase T2: Update draw_matches Table

```sql
ALTER TABLE draw_matches
ADD COLUMN universal_tournament_id VARCHAR(100);

CREATE INDEX idx_draw_matches_universal_id ON draw_matches(universal_tournament_id);
```

#### Phase T3: Modify Match Key Format

**Current:** `{api_tennis_key}_{round}_{players}`
**New:** `{universal_tournament_id}|{round}|{sorted_players}`

**Example:** `ATP|2026|INDIAN-WELLS|R32|NADAL|SINNER`

#### Phase T4: Tournament Resolution Service

**New file:** `tennis-oracle/agent/tournament_resolver.py`

```python
class TournamentResolver:
    def resolve(self, source: str, identifier: str, year: int = None) -> str:
        """
        Resolve any tournament identifier to universal_id.

        Args:
            source: 'api-tennis', 'espn', 'sackmann', 'name'
            identifier: The source-specific ID or name
            year: Optional year for historical data

        Returns:
            Universal tournament ID (e.g., 'ATP|2026|INDIAN-WELLS')
        """
        # Check external_ids table first
        # Fall back to alias matching
        # Use fuzzy matching as last resort
```

---

## Part 2: Universal Player ID System

### Overview

Create a unified player identification system using the format `LASTNAME-FIRSTNAME` (e.g., `NADAL-RAFAEL`) to reliably match players across all data sources regardless of name spelling variations, nicknames, or source-specific formatting.

### Current State

**Database Tables:**
- `players` - Player records with `player_id`, `name`, `tour`
- `player_elo` - ELO ratings keyed by `player_id`
- `player_disruption_scores` - Disruption cache keyed by `player_id` + `tour`
- `prediction_log` - Uses `player_a_name`, `player_b_name` (string matching)
- `draw_matches` - Uses `player_a_id`, `player_b_id` (api-tennis IDs)

**Current ID Systems:**
| Source | ID Format | Example |
|--------|-----------|---------|
| api-tennis | Integer key | `12345` |
| ESPN | Player slug | `novak-djokovic` |
| Sackmann | `player_id` integer | `104925` |
| Internal DB | Serial `player_id` | `1`, `2`, `3`... |
| WTA | `player_id` string | `wta123456` |

**Name Variation Examples:**
| Player | api-tennis | ESPN | Sackmann |
|--------|------------|------|----------|
| Novak Djokovic | "N. Djokovic" | "Novak Djokovic" | "Novak Djokovic" |
| Alexander Zverev | "A. Zverev" | "Alexander Zverev" | "Alexander Zverev" |
| Iga Świątek | "I. Swiatek" | "Iga Swiatek" | "Iga Swiatek" |

**Key Challenges:**
- Diacritics/accents: Świątek vs Swiatek
- Name abbreviations: "A." vs "Alexander"
- Hyphenated names: "Auger-Aliassime" vs "Auger Aliassime"
- Name changes (marriage): "Elina Svitolina" → may vary
- Jr/Sr suffixes: "Carlos Alcaraz" vs "Carlos Alcaraz Garfia"

### Proposed Universal Player ID Format

```
LASTNAME-FIRSTNAME
```

**Format Rules:**
1. All uppercase ASCII (diacritics normalized)
2. Hyphenated last names preserved: `AUGER-ALIASSIME-FELIX`
3. Spaces converted to hyphens
4. No suffixes (Jr, Sr, III)
5. First name uses common/known name, not legal name

**Examples:**
- `NADAL-RAFAEL`
- `DJOKOVIC-NOVAK`
- `SWIATEK-IGA`
- `AUGER-ALIASSIME-FELIX`
- `SINNER-JANNIK`

### Player Implementation Phases

#### Phase P1: Database Schema

Add new column and mapping table:
```sql
-- Add universal_id to players table
ALTER TABLE players
ADD COLUMN universal_id VARCHAR(100) UNIQUE;

-- Create alias/mapping table for name variations
CREATE TABLE player_aliases (
    id SERIAL PRIMARY KEY,
    universal_id VARCHAR(100) NOT NULL,
    alias_name VARCHAR(200) NOT NULL,  -- The variant name
    source VARCHAR(50),                  -- Where this variant comes from
    UNIQUE(alias_name, source)
);

CREATE INDEX idx_player_aliases_name ON player_aliases(alias_name);
CREATE INDEX idx_player_aliases_universal ON player_aliases(universal_id);

-- External ID mapping (like tournaments)
CREATE TABLE player_external_ids (
    id SERIAL PRIMARY KEY,
    universal_id VARCHAR(100) NOT NULL,
    source VARCHAR(50) NOT NULL,  -- 'api-tennis', 'espn', 'sackmann', 'wta'
    external_id VARCHAR(100) NOT NULL,
    UNIQUE(source, external_id)
);
```

#### Phase P2: Player Resolution Service

**New file:** `tennis-oracle/agent/player_resolver.py`

```python
import unicodedata
import re

class PlayerResolver:
    def normalize_name(self, name: str) -> str:
        """
        Normalize a player name to universal_id format.

        "Iga Świątek" → "SWIATEK-IGA"
        "N. Djokovic" → needs lookup (ambiguous first name)
        """
        # Remove diacritics
        normalized = unicodedata.normalize('NFKD', name)
        ascii_name = normalized.encode('ASCII', 'ignore').decode('ASCII')

        # Split into parts, handle "LAST, FIRST" vs "FIRST LAST"
        # Return LASTNAME-FIRSTNAME format

    def resolve(self, name: str, source: str = None) -> str:
        """
        Resolve any player name/ID to universal_id.

        Args:
            name: Player name or external ID
            source: Optional source hint ('api-tennis', 'espn', etc.)

        Returns:
            Universal player ID (e.g., 'NADAL-RAFAEL')
        """
        # 1. Check player_external_ids if source provided
        # 2. Check player_aliases for exact match
        # 3. Try normalize_name() and lookup
        # 4. Fuzzy match as last resort

    def get_display_name(self, universal_id: str) -> str:
        """
        Get the display name for a universal_id.

        'NADAL-RAFAEL' → 'Rafael Nadal'
        """
```

#### Phase P3: Seed Initial Player Data

```python
# Core player seeding with known aliases
PLAYER_SEEDS = {
    'NADAL-RAFAEL': {
        'display_name': 'Rafael Nadal',
        'tour': 'ATP',
        'aliases': ['R. Nadal', 'Rafa Nadal', 'Rafael Nadal Parera'],
        'external_ids': {
            'api-tennis': '12345',
            'sackmann': '104745'
        }
    },
    'DJOKOVIC-NOVAK': {
        'display_name': 'Novak Djokovic',
        'tour': 'ATP',
        'aliases': ['N. Djokovic', 'Nole'],
        'external_ids': {
            'api-tennis': '12346',
            'sackmann': '104925'
        }
    },
    # ... top 100 ATP + top 100 WTA
}
```

#### Phase P4: Update Data Pipelines

**Prediction pipeline:**
- Resolve player names to `universal_id` before matching
- Store `universal_id` alongside display names in `prediction_log`

**Draw sync:**
- Map api-tennis player IDs to `universal_id`
- Store both for backward compatibility

**ELO calculations:**
- Key by `universal_id` instead of source-specific ID
- Enables cross-source ELO history

#### Phase P5: Update Disruption Worker

```python
# Current: keyed by player_id + tour
# New: keyed by universal_id

ALTER TABLE player_disruption_scores
ADD COLUMN universal_player_id VARCHAR(100);

CREATE INDEX idx_disruption_universal ON player_disruption_scores(universal_player_id);
```

---

## Combined Match Key Format

After both systems are implemented:

```
{tournament_universal_id}|{round}|{player1_universal_id}|{player2_universal_id}
```

**Example:**
```
ATP|2026|INDIAN-WELLS|R32|NADAL-RAFAEL|SINNER-JANNIK
```

**Benefits:**
- Completely source-agnostic
- Human-readable for debugging
- Stable across data source changes
- Enables reliable joins across all tables

---

## Migration Strategy

1. **Add columns** - Non-breaking, additive changes
2. **Backfill data** - Populate universal_ids for existing records
3. **Dual-write** - Write both old and new IDs during transition
4. **Update reads** - Migrate queries to use universal_id
5. **Remove old columns** - After verification period (optional)

**Backward Compatibility:**
- Old match keys continue to work during transition
- New match keys coexist with old
- Gradual rollout starting with new tournaments/matches

---

## Out of Scope (For Now)

- **The Odds API integration** - Design accommodates future addition
- **Historical backfill before 2025** - Focus on current/future data
- **UI changes** - No user-facing ID display
- **Doubles players** - Singles only initially

---

## Verification Plan

### Tournament System
1. Create tournament with universal_id
2. Sync draw from api-tennis
3. Verify match keys use new format
4. Check ticker displays correctly

### Player System
1. Resolve player from multiple sources
2. Verify same universal_id returned
3. Check prediction pipeline uses correct IDs
4. Verify disruption scores keyed correctly

### Integration Test
Full pipeline: api-tennis sync → prediction → ticker → draw display

---

## Estimated Impact

**Files to modify:**
- 5-6 Python files in tennis-oracle
- 3-4 TypeScript files in swingtree
- 2 new Python modules (TournamentResolver, PlayerResolver)
- Database migrations

**Risk:** Medium - Changes touch core data model but can be done incrementally with backward compatibility.

**Dependencies:**
- Tournament system should be implemented first (simpler)
- Player system builds on tournament patterns
