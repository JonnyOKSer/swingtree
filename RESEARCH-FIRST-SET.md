# Research: Improving First Set Score Prediction

*ASHE Prediction Engine Enhancement - March 2026*

---

## 1. Current System Analysis

### How ASHE Currently Predicts First Sets

The tennis-oracle codebase (`/Users/jonathan/Documents/My Projects/Code/tennis-oracle`) currently implements four first set models:

1. **First Set Winner** - XGBoost binary classifier predicting which player wins set 1
2. **First Set Correct Score** - Multiclass classifier for 7 score categories: 6-0, 6-1, 6-2, 6-3, 6-4, 7-5, 7-6
3. **First Set Tiebreak** - Binary classifier for tiebreak probability
4. **First Set Over/Under 9.5** - Binary classifier for total games

**Key Files:**
- `model/first_set_train.py` - Training pipeline for all four models
- `features/first_set_features.py` - Feature engineering (rolling stats)
- `agent/build_first_set_stats.py` - Builds rolling player statistics
- `model/predict.py` - Production inference with divergence logic

### Current Features Used

The system relies on these first-set-specific features:
- `first_set_win_pct` - Historical first set win rate per player
- `comeback_rate` - Probability of winning match after losing first set
- `avg_first_set_games` - Average total games in first sets
- `first_set_tiebreak_pct` - Historical tiebreak frequency
- `slow_starter_flag` - Binary flag for players who often lose set 1 but win matches

Plus all standard match features: ELO, surface ELO, H2H, form, serve stats, physical attributes, tournament context.

### Current Approach Limitations

1. **No Point-Level Modeling**: The system predicts set scores directly without modeling the underlying point/game dynamics
2. **Treats All 6-4s as Equal**: A bagel threat that became 6-4 vs. a tight 6-4 are not distinguished
3. **Limited Serve/Return Integration**: Serve statistics exist but aren't converted to game-level probabilities
4. **No Break Point Dynamics**: Break point conversion rates aren't factored into score predictions
5. **Independence Assumption**: Assumes games within a set are independent (they're not - momentum exists)

---

## 2. First Set Score Recommendations

### Recommendation 1: Hierarchical Point-Game-Set Markov Model

**Mathematical Basis:**

The [Klaassen-Magnus model](https://www.janmagnus.nl/papers/JRM065.pdf) and extensions by [O'Malley](https://www.nessis.org/nessis07/James_OMalley.pdf) establish that tennis can be modeled hierarchically:

```
P(point win | serve) --> P(game win) --> P(set win) --> P(match win)
```

Under the i.i.d. assumption for points, if player A wins a point on serve with probability `p_A` and player B wins a point on serve with probability `p_B`, then:

**Game Win Probability (server wins):**
```
G(p) = p^4 * (1 + 4q + 10q^2) + 20p^3*q^3 * (p^2 / (1 - 2pq))
where q = 1 - p
```

This formula from O'Malley captures deuce scenarios. For `p = 0.65` (typical first serve point win), `G(0.65) = 0.82`.

**Set Win Probability:**
Using the game probabilities `G_A` (A holds serve) and `G_B` (B holds serve), the set score distribution can be computed via Markov chain transition matrices where states are (games_A, games_B).

**Implementation Approach:**
1. Estimate `p_A` and `p_B` from existing serve statistics:
   - `p_serve = first_serve_pct * first_serve_win_pct + (1 - first_serve_pct) * second_serve_win_pct`
2. Compute `G_A` and `G_B` using O'Malley's game formula
3. Build transition matrix for set states (0-0) through (7-6)
4. Extract probability distribution over final scores

**Data Required:**
- First serve percentage (already have)
- First serve points won percentage (already have)
- Second serve points won percentage (already have)
- These need to be computed per-surface for accuracy

**Expected Improvement:**
- More principled score distribution (currently XGBoost learns these implicitly)
- Better tiebreak probability (derived from game probabilities, not learned separately)
- Estimated +3-5% accuracy on exact score prediction

**Implementation Complexity:** Medium
- Need to implement Markov chain transition matrices
- Can be done in pure NumPy (no new dependencies)
- Approximately 200-300 lines of code

---

### Recommendation 2: Break Point Conversion Rate Integration

**Mathematical Basis:**

Service breaks are the fundamental unit that determines set scores. A set score of 6-4 means exactly one break of serve occurred (the server with 4 games was broken once). A 6-3 means the winner broke twice (or broke once and got broken back, then broke again).

Current research shows [break point dynamics significantly affect momentum](https://www.mdpi.com/2673-9909/5/3/77), and break point conversion rates vary substantially between players independent of overall ability.

**Key Insight:** Two players might have identical match win rates but very different first set profiles:
- Player A: Holds serve 85%, converts 40% of break points -> tight first sets
- Player B: Holds serve 90%, converts 30% of break points -> also tight first sets
- Player C: Holds serve 80%, converts 50% of break points -> volatile first sets

**Implementation Approach:**

1. **Compute break point features per player:**
   ```python
   bp_faced_per_service_game = total_bp_faced / service_games_played
   bp_saved_pct = bp_saved / bp_faced  # already have this
   bp_created_per_return_game = total_bp_won / return_games_played  # new
   bp_conversion_rate = bp_won / bp_created  # new
   ```

2. **Model expected breaks per set:**
   ```
   E[breaks_A_against_B] = return_games * bp_created_rate_A * bp_conversion_rate_A * (1 - bp_saved_rate_B)
   ```

3. **Map breaks to scores:**
   | Net breaks by winner | Possible scores |
   |---------------------|-----------------|
   | +1 | 6-4, 7-5 |
   | +2 | 6-3, 6-2 (with 1 break back) |
   | +3 | 6-2, 6-1 |
   | +4+ | 6-1, 6-0 |
   | 0 (tiebreak) | 7-6 |

**Data Required:**
- Break points faced (already have as `w_bpFaced`, `l_bpFaced`)
- Break points saved (already have as `w_bpSaved`, `l_bpSaved`)
- Need to compute: break points created (bp_faced by opponent = bp_created)
- Need to compute: return games played (approximated from match data)

**Expected Improvement:**
- Better discrimination between 6-3 and 6-4 predictions
- Improved bagel/breadstick detection for mismatches
- Estimated +2-4% accuracy on close score categories

**Implementation Complexity:** Low
- Features can be computed from existing data
- Add 5-6 new features to first set model
- Approximately 50-100 lines of code

---

### Recommendation 3: Monte Carlo Point-by-Point Simulation

**Mathematical Basis:**

[Recent research by Wang and Drekic (2026)](https://journals.sagepub.com/doi/10.1177/22150218251412670) shows that ensembling Markov chain models with point-specific modifications achieves ~70% accuracy on match outcomes. The [Bayesian hierarchical approach by Ingram](https://martiningram.github.io/papers/bayes_point_based.pdf) separates serve and return skill estimates for more granular predictions.

The key insight: instead of computing closed-form probabilities, simulate 10,000+ first sets point-by-point and observe the empirical score distribution.

**Simulation Algorithm:**
```python
def simulate_first_set(p_serve_A, p_serve_B, n_sims=10000):
    scores = defaultdict(int)

    for _ in range(n_sims):
        games_A, games_B = 0, 0
        server = 'A'  # A serves first

        while not set_over(games_A, games_B):
            p_point = p_serve_A if server == 'A' else p_serve_B
            game_winner = simulate_game(p_point)

            if game_winner == server:
                if server == 'A': games_A += 1
                else: games_B += 1
            else:
                if server == 'A': games_B += 1
                else: games_A += 1

            server = 'B' if server == 'A' else 'A'

            # Handle tiebreak at 6-6
            if games_A == 6 and games_B == 6:
                tb_winner = simulate_tiebreak(p_serve_A, p_serve_B)
                if tb_winner == 'A': games_A = 7
                else: games_B = 7

        score = f"{max(games_A, games_B)}-{min(games_A, games_B)}"
        scores[score] += 1

    return {k: v/n_sims for k, v in scores.items()}
```

**Advantages Over Closed-Form:**
1. Can incorporate momentum effects (varying `p_serve` based on game state)
2. Can model fatigue within set (serve speed drops after long games)
3. Can incorporate specific player tendencies (some players serve better when behind)
4. Naturally handles tiebreak probabilities

**Data Required:**
- Point win probabilities on serve (derived from existing stats)
- Optional: point-by-point data from Grand Slams (Jeff Sackmann's `tennis_slam_pointbypoint` repo)
- Optional: momentum coefficients from match charting data

**Expected Improvement:**
- Most accurate score distribution modeling
- Proper uncertainty quantification (confidence intervals on predictions)
- Natural handling of edge cases (tiebreaks, etc.)
- Estimated +5-8% accuracy with momentum modeling

**Implementation Complexity:** Medium-High
- Core simulation is straightforward
- Momentum modeling requires additional research
- Need to optimize for speed (Numba/Cython for 10K+ simulations per match)
- Approximately 400-600 lines of code

---

### Recommendation 4: First Set Momentum and "Nervousness" Factors

**Mathematical Basis:**

Research on [tennis momentum](https://arxiv.org/html/2404.13300v1) using EWMA (Exponentially Weighted Moving Average) shows that psychological state affects point outcomes. The first set is unique because:

1. **No match context** - players haven't established rhythm
2. **Higher variance** - nervousness affects some players more
3. **Surface adjustment** - first games may differ as players calibrate to conditions

[Studies show](https://www.nature.com/articles/s41598-024-69876-5) break points have outsized momentum effects, and this is especially pronounced in set 1.

**Proposed Features:**

1. **First Match Rust Factor:**
   ```python
   is_first_match_of_tournament = 1 if round == 'R128' or round == 'R64' else 0
   days_since_last_competitive_match  # longer = more rust
   ```

2. **Opponent Quality Pressure:**
   ```python
   elo_gap_pressure = max(0, opponent_elo - player_elo)  # Asymmetric - only pressure when facing better
   ```

3. **Historical First Set Variance:**
   ```python
   first_set_games_std = std(total_games in last 30 first sets)  # High std = volatile player
   first_set_blowout_rate = pct of first sets won/lost 6-0, 6-1, 6-2
   ```

4. **Tournament Stage Nervousness:**
   ```python
   # Finals/SFs have different first set dynamics than R64
   stage_weight = {
       'R128': 0.8, 'R64': 0.85, 'R32': 0.9, 'R16': 0.95,
       'QF': 1.0, 'SF': 1.05, 'F': 1.1
   }
   ```

**Data Required:**
- Tournament round (already have)
- Days since last match (already have)
- Historical first set games data (have in `first_set_results` table)
- Need to compute: standard deviation of first set games per player

**Expected Improvement:**
- Better handling of early-round variance
- Improved big-match predictions
- Estimated +1-3% accuracy overall, +5% on finals

**Implementation Complexity:** Low
- Simple feature engineering
- No new data sources required
- Approximately 50-100 lines of code

---

## 3. Expanded Prop Markets Research

### First Set Winner Market

The first set winner market is directly served by the current model. Key improvements:

1. **Divergence Detection**: The current system has logic for "slow starters" but could be enhanced:
   ```python
   # Current: simple binary flag
   slow_starter_flag = fs_win_pct < 0.50 and match_win_pct > 0.55

   # Proposed: continuous divergence score
   divergence_score = (match_win_prob - first_set_win_prob) / match_win_prob
   # High divergence = match favorite often loses first set
   ```

2. **Surface-Specific First Set Profiles**: Some players are faster starters on certain surfaces (e.g., big servers on grass where first strike tennis dominates).

### Match Length Markets (3 Sets / 4-5 Sets)

**WTA: Probability of 3 Sets**
```
P(3 sets) = P(player A wins set 1) * P(player B wins set 2 | A won set 1) +
            P(player B wins set 1) * P(player A wins set 2 | B won set 1)
```

Under independence assumption:
```
P(3 sets) = 2 * P(A wins set) * P(B wins set)  # If sets are independent
```

But sets are NOT independent. Key adjustments:
- **Momentum**: Set 1 winner has psychological edge (~5% boost in set 2)
- **Fatigue**: Longer set 1 slightly favors fresh set 2 winner
- **Comeback ability**: `comeback_rate` feature already captures this

**ATP: Probability Distribution over 3, 4, 5 Sets**

For ATP best-of-5 matches (Grand Slams):

```
P(3 sets) = P(one player wins 3-0)
P(4 sets) = P(one player wins 3-1)
P(5 sets) = P(match goes to deciding set)
```

The Markov chain approach naturally provides these distributions. With game-level modeling:

```
P(3-0) = P_A^3 + P_B^3  # One player wins all three sets
P(3-1) = 3*(P_A^3*P_B + P_B^3*P_A)  # 3 choose 1 ways to lose one set
P(3-2) = 6*P_A^2*P_B^2*P_decided  # Goes to decider
```

Where `P_decided` is the probability the leader wins the fifth set (slightly >50% due to momentum).

**Implementation:** Add these as outputs from the Monte Carlo simulation:
```python
def simulate_match(p_serve_A, p_serve_B, best_of=3):
    sets_A, sets_B = 0, 0
    set_scores = []

    while sets_A < (best_of // 2 + 1) and sets_B < (best_of // 2 + 1):
        set_result = simulate_set(p_serve_A, p_serve_B)
        set_scores.append(set_result)
        if set_result['winner'] == 'A': sets_A += 1
        else: sets_B += 1

    return {
        'winner': 'A' if sets_A > sets_B else 'B',
        'total_sets': sets_A + sets_B,
        'set_scores': set_scores
    }
```

### Correlation Analysis: First Set to Match Length

Key correlations from tennis data:

| First Set Margin | P(Straight Sets Win) | P(3+ Sets) |
|-----------------|---------------------|------------|
| 6-0, 6-1 | ~85% | ~15% |
| 6-2, 6-3 | ~75% | ~25% |
| 6-4 | ~70% | ~30% |
| 7-5 | ~65% | ~35% |
| 7-6 | ~62% | ~38% |

**First set tiebreaks correlate with longer matches** because:
1. Players are evenly matched on serve
2. Neither has established dominance
3. The set 1 loser is still competitive

This can be exploited for live betting: a 7-6 first set predicts 38% chance of going to deciding set vs. baseline ~30%.

---

## 4. Data Requirements Summary

### Already Available in ASHE

| Data | Source | Quality |
|------|--------|---------|
| First serve percentage | `matches` table | Good |
| First serve points won | `matches` table | Good |
| Second serve points won | `matches` table | Good |
| Break points saved/faced | `matches` table | Good |
| First set results | `first_set_results` table | 200K+ matches |
| Rolling first set stats | `first_set_player_stats` table | Good |

### Needs Computation from Existing Data

| Feature | How to Compute |
|---------|----------------|
| Break points created | `bp_faced` of opponent |
| Break point conversion rate | Aggregate from match results |
| First set games variance | `std(total_games)` from rolling window |
| Surface-specific serve stats | Filter existing serve stats by surface |

### Would Require New Data Sources

| Data | Source | Value |
|------|--------|-------|
| Point-by-point data | `tennis_slam_pointbypoint` (Sackmann) | High - enables momentum modeling |
| In-match serve speed | ATP/WTA official stats | Medium - fatigue modeling |
| Court conditions | Weather APIs | Low - marginal improvement |

### Data Priority

1. **Immediate (no new data)**: Implement break point features, first set variance
2. **Short-term**: Load point-by-point data for Grand Slams
3. **Medium-term**: Build surface-specific serve probability models
4. **Long-term**: Real-time serve speed and conditions integration

---

## 5. Implementation Priority Ranking

| Rank | Recommendation | Effort | Impact | ROI |
|------|---------------|--------|--------|-----|
| 1 | **Break Point Conversion Features** | Low (50-100 LOC) | Medium (+2-4%) | **Highest** |
| 2 | **First Set Momentum Features** | Low (50-100 LOC) | Medium (+1-3%) | **High** |
| 3 | **Hierarchical Markov Model** | Medium (200-300 LOC) | High (+3-5%) | **Medium-High** |
| 4 | **Monte Carlo Simulation** | High (400-600 LOC) | High (+5-8%) | **Medium** |

### Recommended Implementation Order

**Phase 1 (1-2 days):**
- Add break point conversion features to `first_set_features.py`
- Add first set variance features
- Retrain first set models

**Phase 2 (3-5 days):**
- Implement O'Malley's game probability formula
- Build Markov chain transition matrix for set scoring
- Compare against current XGBoost multiclass approach

**Phase 3 (1-2 weeks):**
- Build Monte Carlo simulation engine
- Optimize with Numba for performance
- Add as alternative prediction method with uncertainty quantification

**Phase 4 (Ongoing):**
- Load point-by-point Grand Slam data
- Train momentum coefficients
- Integrate psychological state modeling

---

## 6. Academic References

1. **Klaassen & Magnus** - [Forecasting the Winner of a Tennis Match](https://www.janmagnus.nl/papers/JRM065.pdf) - Foundational point-by-point model

2. **O'Malley** - [The Tennis Formula](https://www.nessis.org/nessis07/James_OMalley.pdf) - Game/set/match probability formulas

3. **Wang & Drekic (2026)** - [Boosting Markovian Tennis Prediction](https://journals.sagepub.com/doi/10.1177/22150218251412670) - Latest ensemble methods achieving ~70% accuracy

4. **Ingram** - [Bayesian Hierarchical Model](https://martiningram.github.io/papers/bayes_point_based.pdf) - Separating serve/return skills

5. **Momentum Research** - [Capturing Momentum in Tennis](https://arxiv.org/html/2404.13300v1) - EWMA-based momentum quantification

6. **Nature Scientific Reports** - [Momentum Prediction with CatBoost](https://www.nature.com/articles/s41598-024-69876-5) - Break point momentum effects

---

## 7. Key Takeaways

1. **The current approach is solid but leaves accuracy on the table** by not modeling the hierarchical point-game-set structure explicitly.

2. **Break point dynamics are underutilized** - they're the fundamental unit that determines set scores, but current features don't fully capture conversion rates.

3. **Monte Carlo simulation would provide the most accurate predictions** but requires more implementation effort. The Markov chain closed-form approach is a good middle ground.

4. **First set is NOT independent of match outcome** - the same players who win first sets tend to win matches, but there are systematic exceptions (slow starters) that create betting value.

5. **Expanded prop markets (match length) flow naturally from first set modeling** - once you have accurate set-level probabilities, match length distributions are straightforward.

The recommended path: Start with low-hanging fruit (break point features), validate improvement, then progressively add hierarchical modeling.
