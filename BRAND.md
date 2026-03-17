# ASHE Brand Design Document

## Brand Overview

**Product Name:** ASHE
**Full Name:** Autonomous Signal Harvesting Engine
**Parent Brand:** swingtree.ai
**Domain:** swingtree.ai
**Product Category:** Tennis match prediction service
**Launch:** 2026

### Brand Essence

ASHE is a premium, data-driven tennis prediction service that combines sophisticated machine learning with an elegant, nature-inspired aesthetic. The brand draws from the African savanna—specifically the acacia tree (swingtree)—to evoke themes of patience, observation, and natural intelligence.

### Brand Personality

- **Sophisticated** — Premium feel, not mass-market
- **Confident** — Data-backed certainty without arrogance
- **Mysterious** — The "oracle" speaks; users listen
- **Technical** — Embraces complexity, doesn't hide it
- **Exclusive** — Limited capacity (3,000 users), waitlist model

### Brand Promise

"The oracle speaks. Here's the proof."

ASHE delivers statistically-validated tennis predictions with full transparency. Every prediction is logged, tracked, and publicly verifiable.

---

## Visual Identity

### Color Palette

| Color | Name | Hex | RGB | Usage |
|-------|------|-----|-----|-------|
| ![#1a1a1a](https://via.placeholder.com/20/1a1a1a/1a1a1a.png) | Charcoal | `#1a1a1a` | 26, 26, 26 | Primary background |
| ![#2a2a2a](https://via.placeholder.com/20/2a2a2a/2a2a2a.png) | Charcoal Light | `#2a2a2a` | 42, 42, 42 | Cards, elevated surfaces |
| ![#0a0a0a](https://via.placeholder.com/20/0a0a0a/0a0a0a.png) | Charcoal Dark | `#0a0a0a` | 10, 10, 10 | Deep backgrounds |
| ![#c4973b](https://via.placeholder.com/20/c4973b/c4973b.png) | Serengeti Gold | `#c4973b` | 196, 151, 59 | Primary accent, CTAs, links |
| ![#8a8a7a](https://via.placeholder.com/20/8a8a7a/8a8a7a.png) | Ash Grey | `#8a8a7a` | 138, 138, 122 | Secondary text, muted elements |
| ![#ffffff](https://via.placeholder.com/20/ffffff/ffffff.png) | Flash White | `#ffffff` | 255, 255, 255 | Primary text, high contrast |

#### Color Usage Guidelines

- **Charcoal (#1a1a1a):** Always the primary background. Never use white backgrounds.
- **Serengeti Gold (#c4973b):** Reserved for interactive elements, the wordmark, and key data points. Use sparingly—gold loses impact when overused.
- **Ash Grey (#8a8a7a):** For secondary information, timestamps, metadata, and subtle UI elements.
- **Flash White (#ffffff):** Primary text color. Use for headlines, body copy, and high-priority data.

#### Gold Opacity Variants

```css
--gold-dim: rgba(196, 151, 59, 0.3);   /* Subtle backgrounds, disabled states */
--gold-glow: rgba(196, 151, 59, 0.6); /* Hover states, soft emphasis */
```

### Typography

#### Font Stack

| Purpose | Font | Fallbacks | CSS Class |
|---------|------|-----------|-----------|
| Headings & Wordmark | Playfair Display | Georgia, serif | `.serif` |
| Body Text | System UI | -apple-system, BlinkMacSystemFont, Segoe UI, Roboto | (default) |
| Data & Code | JetBrains Mono | Fira Code, SF Mono, monospace | `.mono` |

#### Type Scale

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Wordmark (ASHE) | 48-72px | 400 | Playfair Display |
| Page Titles | 32-40px | 400 | Playfair Display |
| Section Headers | 20-24px | 600 | System UI |
| Body Copy | 14-16px | 400 | System UI |
| Data/Stats | 14-18px | 500 | JetBrains Mono |
| Captions/Meta | 11-12px | 400 | System UI |

#### Typography Guidelines

- Wordmark "ASHE" always uses Playfair Display serif
- The tagline "Autonomous Signal Harvesting Engine" uses monospace (JetBrains Mono)
- Player names and match data use monospace for scanability
- Never use all-caps except for tier badges (STRONG, CONFIDENT, PICK, LEAN, SKIP)

### Logo & Wordmark

#### Primary Wordmark

```
ASHE
Autonomous Signal Harvesting Engine
```

- "ASHE" in Playfair Display, Serengeti Gold (#c4973b)
- Tagline in JetBrains Mono, Ash Grey (#8a8a7a), letter-spacing: 2px
- Minimum clear space: 1x the height of the "A"

#### Logo Usage Rules

1. **Color:** Gold on charcoal (preferred), white on charcoal (alternate), charcoal on white (rare)
2. **Minimum size:** 80px width for digital
3. **Clear space:** Equal to the height of "A" on all sides
4. **Don't:** Stretch, rotate, add effects, change colors, or place on busy backgrounds

### Iconography

#### Tier Emojis (for social/tweets)

| Tier | Emoji | Unicode | Meaning |
|------|-------|---------|---------|
| STRONG | 🟡 | U+1F7E1 | High confidence (85%+) |
| CONFIDENT | 🟤 | U+1F7E4 | Solid pick (75-84%) |
| PICK | ⬜ | U+2B1C | Standard bet (65-74%) |
| LEAN | ⚪ | U+26AA | Slight edge (55-64%) |
| SKIP | ⚫ | U+26AB | No action (<55%) |

#### Result Indicators

| Status | Emoji | Meaning |
|--------|-------|---------|
| Correct | ✅ | Prediction correct |
| Incorrect | ❌ | Prediction wrong |
| First Set Hit | 🌳 | Exact first set score correct |
| Divergence | ⚡ | First set winner differs from match winner |

### Visual Elements

#### Serengeti Scene

The landing page features an animated 3D scene of an acacia tree (swingtree) in the African savanna at dusk. Key elements:

- Silhouetted acacia tree against gradient sky
- Subtle grass movement animation
- Warm golden-hour lighting
- Stars appearing as scene darkens

This scene reinforces the brand's connection to nature, patience, and the concept of "watching from above."

#### UI Patterns

- **Cards:** Charcoal Light (#2a2a2a) with subtle border, no shadows
- **Buttons:** Gold background with charcoal text, or outlined gold
- **Inputs:** Charcoal background, gold border on focus
- **Tables:** Minimal borders, alternating subtle row colors

---

## Voice & Tone

### Brand Voice

ASHE speaks with **quiet confidence**. It doesn't boast—it states facts and lets the results speak.

#### Voice Attributes

| Attribute | Description | Example |
|-----------|-------------|---------|
| **Authoritative** | Speaks from data, not opinion | "82% win probability based on 364,000+ matches" |
| **Concise** | No fluff or marketing speak | "Sinner d. Medvedev (87%)" not "We're excited to predict..." |
| **Mysterious** | The oracle persona | "The oracle spoke. Here's the proof." |
| **Technical** | Embraces complexity | "ELO-based model with surface coefficients" |

### Tone Guidelines

#### Do:
- State predictions directly: "Sinner defeats Medvedev"
- Use data to back claims: "Season record: 78% on STRONG picks"
- Acknowledge uncertainty: "LEAN tier — slight edge only"
- Be transparent about misses: "❌ Incorrect — Alcaraz upset"

#### Don't:
- Overpromise: "Guaranteed winners!"
- Use hype language: "AMAZING prediction!!!"
- Hide misses or cherry-pick stats
- Use first person plural excessively: "We think..."

### Terminology

| Use | Don't Use |
|-----|-----------|
| Prediction | Tip, pick (in formal contexts) |
| Confidence tier | Bet rating |
| Match winner | Winner prediction |
| First set score | Correct score |
| Reconciled | Graded, settled |
| ASHE | The ASHE, ASHE AI |

---

## Product Tiers

### Subscription Structure

| Tier | Price | Target User |
|------|-------|-------------|
| **Baseline** | $29/mo | Casual fan, Grand Slams only |
| **All-Court** | $79/mo | Serious bettor, all tournaments |
| **Tree Top** | $199/mo | Professional, full data access |

### Tier Naming Rationale

- **Baseline:** Tennis term (back of court), entry-level positioning
- **All-Court:** Tennis term (versatile player), full coverage
- **Tree Top:** Swingtree brand metaphor, premium vantage point

### Feature Matrix

| Feature | Baseline | All-Court | Tree Top |
|---------|----------|-----------|----------|
| Grand Slams + Masters | ✓ | ✓ | ✓ |
| All tournaments | — | ✓ | ✓ |
| Match winner predictions | ✓ | ✓ | ✓ |
| First set winner | — | ✓ | ✓ |
| O/U 9.5 games | — | ✓ | ✓ |
| Divergence alerts | — | ✓ | ✓ |
| First set correct score | — | — | ✓ |
| Disruption alerts | — | — | ✓ |
| Early access (2hr head start) | — | — | ✓ |

---

## Messaging Framework

### Taglines & Headlines

**Primary Tagline:**
> Autonomous Signal Harvesting Engine

**Secondary Taglines:**
> "The oracle spoke. Here's the proof."
> "364,000+ matches. One prediction engine."
> "Data-driven tennis predictions."

**Headlines by Context:**

| Context | Headline |
|---------|----------|
| Landing page | "ASHE" (wordmark only, tagline below) |
| Subscription | "Unlock the full power of ASHE" |
| Trial start | "Welcome to ASHE. Your 7-day trial has started." |
| Trial expired | "Your trial has ended. Subscribe to continue." |
| Results proof | "The oracle spoke. Here's the proof." |
| Waitlist | "ASHE has reached maximum capacity." |

### Email Subject Lines

| Type | Subject |
|------|---------|
| Tournament notification | "🎾 [Tournament] starts in 3 days — predictions incoming" |
| Trial expiring | "Your ASHE trial ends tomorrow" |
| Payment failed | "Action required: Update your payment method" |

### Social Media (X/Twitter)

**Prediction Post Format:**
```
🎾 ASHE | [Tournament] ([Tour])

🟡 STRONG: [Winner] d. [Loser] ([%]) | 1st: [Name] [Score]
🟤 CONFIDENT: [Winner] d. [Loser] ([%]) | 1st: [Name] [Score]
⬜ PICK: [Winner] d. [Loser] ([%])

📊 swingtree.ai/proof
```

**Results Post Format:**
```
🎾 ASHE | [Tournament] ([Tour]) Results

✅ [Winner] d. [Loser] [Score] 🌳
✅ [Winner] d. [Loser] [Score]
❌ [Winner] d. [Loser] [Score]

Match: X/Y | 1st set scores: X/Y 🌳
📊 swingtree.ai/proof
```

---

## Application Examples

### Email Template Style

```
Background: #1a1a1a
Text: #ffffff
Accent: #c4973b
Secondary text: #787068

Header: ASHE wordmark centered, gold
Body: Dark container with 1px #333 border
CTA Button: Gold background (#c4973b), charcoal text (#1a1a1a)
Footer: #787068 text, centered
```

### Web Application

- Always dark mode (charcoal background)
- Gold accents for interactive elements only
- Serif (Playfair Display) for wordmark and major headings
- Monospace for data, predictions, and stats
- Minimal UI chrome—let data breathe

### Print (if applicable)

- Invert to charcoal on cream/white paper
- Gold becomes metallic gold foil or Pantone 874 C
- Maintain generous whitespace

---

## Legal & Compliance

### Required Disclaimers

All prediction content must include:

> "ASHE predictions are for informational and entertainment purposes only. Past performance does not guarantee future results. Gambling involves risk."

### Trademark Usage

- "ASHE" and "swingtree.ai" are trademarks of FNDM LLC
- Always use proper trademark symbols in legal contexts: ASHE™, swingtree.ai™

### Responsible Gambling

- Never guarantee outcomes
- Always show full record (wins AND losses)
- Include links to responsible gambling resources where required by jurisdiction

---

## Brand Assets Checklist

### Digital Assets Needed

- [ ] ASHE wordmark (SVG, PNG @1x, @2x, @3x)
- [ ] ASHE + tagline lockup
- [ ] Social media profile image (gold "A" on charcoal circle)
- [ ] Open Graph image (1200x630)
- [ ] Twitter card image (1200x628)
- [ ] Favicon (16x16, 32x32, apple-touch-icon)
- [ ] Email header image

### Brand Colors (Design Tool Ready)

```
Figma/Sketch:
- Charcoal: 1A1A1A
- Charcoal Light: 2A2A2A
- Charcoal Dark: 0A0A0A
- Serengeti Gold: C4973B
- Ash Grey: 8A8A7A
- Flash White: FFFFFF
```

---

## Contact

**Brand Questions:** support@swingtree.ai
**Technical Issues:** support@swingtree.ai
**Press/Media:** (TBD)

---

*Document Version: 1.0*
*Last Updated: March 2026*
*Maintained by: ASHE/swingtree.ai team*
