import { describe, it, expect } from 'vitest'
import { bracketScrollLeft } from '../src/lib/bracketScroll'

/**
 * Column geometry, as the CSS actually lays it out: a column is
 * --card-width + 20px, separated by an 8px flex gap, inside 16px of padding.
 */
const PADDING = 16
const GAP = 8
const lefts = (cardWidth: number, count: number) =>
  Array.from({ length: count }, (_, i) => PADDING + i * (cardWidth + 20 + GAP))

const DESKTOP = lefts(200, 5) // [16, 244, 472, 700, 928]
const PHONE = lefts(170, 5)   // [16, 214, 412, 610, 808]
const SMALL = lefts(150, 5)   // [16, 194, 372, 550, 728]

describe('bracketScrollLeft', () => {
  it('puts the round before the current one at the left gutter', () => {
    // Current round is the final (index 4) — show the semifinals (index 3).
    expect(bracketScrollLeft({ columnLefts: DESKTOP, roundIndex: 4, maxScroll: 9999, gutter: PADDING }))
      .toBe(DESKTOP[3] - PADDING)
  })

  it('leaves the bracket alone when the current round is the first', () => {
    expect(bracketScrollLeft({ columnLefts: DESKTOP, roundIndex: 0, maxScroll: 9999 })).toBe(0)
  })

  it('leaves the bracket alone when the round was not found', () => {
    // findIndex returns -1, which must not be read as "scroll somewhere".
    expect(bracketScrollLeft({ columnLefts: DESKTOP, roundIndex: -1, maxScroll: 9999 })).toBe(0)
  })

  it('never scrolls past the end of the content', () => {
    // A two-column bracket that fits has nowhere to scroll.
    expect(bracketScrollLeft({ columnLefts: PHONE, roundIndex: 4, maxScroll: 0, gutter: PADDING })).toBe(0)
    expect(bracketScrollLeft({ columnLefts: PHONE, roundIndex: 4, maxScroll: 300, gutter: PADDING })).toBe(300)
  })

  it('handles a round index past the last column', () => {
    expect(bracketScrollLeft({ columnLefts: PHONE, roundIndex: 99, maxScroll: 9999, gutter: PADDING }))
      .toBe(PHONE[PHONE.length - 1] - PADDING)
  })

  it('copes with an empty bracket and with unmeasurable columns', () => {
    expect(bracketScrollLeft({ columnLefts: [], roundIndex: 3, maxScroll: 9999 })).toBe(0)
    expect(bracketScrollLeft({ columnLefts: [NaN, NaN], roundIndex: 1, maxScroll: 9999 })).toBe(0)
  })

  it('never returns a negative scroll position', () => {
    expect(bracketScrollLeft({ columnLefts: [0, 10], roundIndex: 1, maxScroll: 9999, gutter: 50 })).toBe(0)
  })
})

/**
 * The regression this replaced: a hard-coded 240px column pitch. These are the
 * numbers that put the semifinal column half off the left edge of a phone.
 */
describe('the hard-coded 240px pitch it replaced', () => {
  const hardCoded = (roundIndex: number) => Math.max(0, (roundIndex - 1) * 240)

  it('agrees roughly on desktop, where the guess came from', () => {
    const measured = bracketScrollLeft({ columnLefts: DESKTOP, roundIndex: 4, maxScroll: 9999, gutter: PADDING })
    expect(Math.abs(measured - hardCoded(4))).toBeLessThan(50)
  })

  it('is off by most of a card on a phone', () => {
    const measured = bracketScrollLeft({ columnLefts: PHONE, roundIndex: 4, maxScroll: 9999, gutter: PADDING })
    // 594 measured vs 720 guessed: 126px of a 170px card scrolled out of sight.
    expect(measured).toBe(594)
    expect(hardCoded(4) - measured).toBe(126)
  })

  it('is off by more than a whole card on a small phone', () => {
    const measured = bracketScrollLeft({ columnLefts: SMALL, roundIndex: 4, maxScroll: 9999, gutter: PADDING })
    expect(hardCoded(4) - measured).toBeGreaterThan(150)
  })

  it('keeps the previous round fully on screen at every width', () => {
    for (const [columns, cardWidth] of [[DESKTOP, 200], [PHONE, 170], [SMALL, 150]] as const) {
      for (let roundIndex = 1; roundIndex < columns.length; roundIndex++) {
        const scrollLeft = bracketScrollLeft({ columnLefts: columns, roundIndex, maxScroll: 9999, gutter: PADDING })
        const columnLeftOnScreen = columns[roundIndex - 1] - scrollLeft
        expect(columnLeftOnScreen).toBeGreaterThanOrEqual(0)
        // and the whole card, not a sliver of it
        expect(columnLeftOnScreen + cardWidth).toBeGreaterThan(cardWidth - 1)
      }
    }
  })
})
