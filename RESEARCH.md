# Research & Future Considerations

## Superpowers Plugin for Claude Code

**Status:** Bookmarked for post-Miami Open evaluation
**Date Researched:** March 17, 2026

### Overview

[Superpowers](https://github.com/obra/superpowers) is an open-source agentic framework by Jesse Vincent (obra) that enforces a structured 7-phase development workflow. Accepted into official Anthropic marketplace January 2026. 42,000+ GitHub stars.

### The 7-Phase Workflow

1. **Brainstorming** — Refines requirements through dialogue before any code
2. **Git Worktrees** — Creates isolated branches for each feature
3. **Plan Writing** — Breaks work into 2-5 minute micro-tasks
4. **Implementation** — Dispatches subagents with dual-stage review
5. **Testing** — Enforces TDD (red-green-refactor); deletes code written before tests
6. **Code Review** — Validates against plan; blocks on critical issues
7. **Branch Finishing** — Verifies tests, presents merge/PR options

### Key Features

- **Strict TDD enforcement** — Will actually delete code written without tests first
- **Subagent parallelization** — Multiple agents work simultaneously
- **Automatic code review** — Checks spec compliance, security, coverage
- **85-95% test coverage target** — Enterprise-grade quality

### Pros

- Eliminates "vibe coding" — forces planning before implementation
- Claimed 2-3x faster overall development despite upfront planning
- Real example: Notion clone with Kanban/tables in 45-60 minutes, 87% test coverage, zero manual code

### Cons

- **10-20 min overhead** per feature for brainstorm/plan phases
- **Learning curve** — productivity peaks after 5-10 projects
- **Not for quick scripts** — overkill for throwaway code
- **Community-maintained** — potential breaking changes

### Recommendation for ASHE/swingtree

**Where it would help:**
- New features requiring tests (Stripe integration, new API endpoints)
- Enforcing TDD discipline
- Complex refactors where planning prevents regressions

**Where it's overkill:**
- Quick bug fixes
- Adding UI elements
- Minor tweaks

### Installation

```bash
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

### Commands

```bash
/superpowers:brainstorm    # Refine design
/superpowers:write-plan    # Create task breakdown
/superpowers:execute-plan  # Run with sub-agents
```

### Sources

- [GitHub - obra/superpowers](https://github.com/obra/superpowers)
- [Superpowers Complete Guide 2026](https://www.pasqualepillitteri.it/en/news/215/superpowers-claude-code-complete-guide)
- [Dev Genius Explainer](https://blog.devgenius.io/superpowers-explained-the-claude-plugin-that-enforces-tdd-subagents-and-planning-c7fe698c3b82)
- [Superpowers Marketplace](https://github.com/obra/superpowers-marketplace)
- [Superpowers Skills](https://github.com/obra/superpowers-skills)

---

## B2C Lead Generation via Social Listening

**Status:** Validate with Devi trial, then build custom agent post-Miami
**Date Researched:** March 17, 2026

### The Concept

Monitor tennis betting chatter across Reddit, X, and forums to identify high-intent users and drive them to swingtree.ai. Essentially "Lead Poet for B2C" — instead of finding VPs at SaaS companies, find tennis bettors frustrated with bad picks.

### Target Sources

| Platform | Source | Keywords |
|----------|--------|----------|
| Reddit | r/sportsbook | "tennis," "ATP," "WTA" |
| Reddit | r/sportsbetting | "tennis picks," "tennis model" |
| Reddit | r/tennis | "betting," "predictions," "who wins" |
| Reddit | r/algobetting | "tennis," "ELO," "model" |
| X | Search | "tennis betting," "ATP picks," "tennis tips" |
| Forums | Tennis Warehouse | Betting threads |
| Forums | Talk Tennis | Prediction threads |

### Off-the-Shelf Tools Evaluated

| Tool | Price | Platforms | Verdict |
|------|-------|-----------|---------|
| [Devi](https://ddevi.com/en) | $19/mo | Reddit, X, Facebook, LinkedIn, Telegram, Threads, Bluesky | **Best option** — AI intent detection |
| [Redreach](https://redreach.ai/) | ~$29/mo | Reddit only | Good for Reddit-only |
| [AiLeads](https://www.aileads.now/) | $19/mo | Reddit | CRM + reply suggestions |
| [SubSignal](https://www.subsignal.ai/) | ~$25/mo | Reddit | Brand mentions |

### Custom Agent: "ASHE Lead Scout"

**Architecture stubbed at:** `tennis-oracle/agent/lead_scout/`

**Estimated costs:**
- X API (Basic): $100/mo
- Claude API: ~$10-20/mo
- Hosting (Railway): ~$5/mo
- **Total:** ~$115/mo

**Key advantage over off-the-shelf:**
- Tennis-specific intent scoring
- Integration with ASHE prediction data
- Auto-generate responses citing yesterday's accuracy
- "Our model went 4/5 on STRONG picks yesterday"

### Implementation Plan

1. **Immediate:** Try Devi free trial with tennis betting keywords
2. **Post-Miami:** If leads are promising, build custom ASHE Lead Scout
3. **Killer feature:** Auto-responses with proof from swingtree.ai/proof

### Sources

- [Devi - AI Social Listening](https://ddevi.com/en)
- [Redreach - Reddit Lead Gen](https://redreach.ai/)
- [AiLeads - Reddit Tools](https://www.aileads.now/blog/reddit-lead-generation-tools-2026-stack)
- [Building Social Listening Tools 2026](https://dev.to/imbuedata/how-to-build-a-scalable-social-listening-tool-in-2026-without-enterprise-api-pricing-3ejl)
- [Obsei - Open Source Social Listening](https://github.com/obsei/obsei)
- [PRAW - Reddit API](https://praw.readthedocs.io/)

---

## Decision Log

| Date | Topic | Decision | Rationale |
|------|-------|----------|-----------|
| 2026-03-17 | Superpowers plugin | Evaluate post-Miami | Need stability first; don't change dev workflow mid-tournament |
| 2026-03-17 | B2C Lead Gen | Devi trial now, custom agent post-Miami | Validate concept before building |

---

*Last updated: March 17, 2026*
