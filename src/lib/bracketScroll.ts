/**
 * Where to scroll the bracket so the current round is on screen.
 *
 * This used to be `(roundIndex - 1) * 240`, with 240 described in a comment as
 * the "approximate column width". A column is actually `--card-width + 20px`
 * plus the flex gap, and --card-width is a media-query token: 200px on
 * desktop, 170px under 768px, 150px under 375px. So the guess overshot by
 * 12px per column on a laptop and 42px per column on a phone — by the final
 * of a five-round draw that is 126px, which is most of a 170px card. The
 * semifinal column ended up scrolled half out of view with its player names
 * sliced down the middle, and nothing on screen suggested you could scroll
 * back to it.
 *
 * Measuring the columns instead of guessing cannot drift when the tokens
 * change, and clamping to the real scroll range keeps the last round from
 * being pushed against the right edge of a bracket that already fits.
 */
export function bracketScrollLeft({
  columnLefts,
  roundIndex,
  maxScroll,
  gutter = 0,
}: {
  /** Each round column's offset inside the bracket's scrollable content. */
  columnLefts: number[]
  /** Index of the round to bring into view. */
  roundIndex: number
  /** scrollWidth - clientWidth: the furthest the bracket can scroll. */
  maxScroll: number
  /** The bracket's left padding, kept as a gutter rather than scrolled away. */
  gutter?: number
}): number {
  if (roundIndex <= 0 || columnLefts.length === 0) return 0

  // Show the round before the current one too — a bracket reads from its
  // previous round, and the context is what makes the current one legible.
  const target = columnLefts[Math.min(roundIndex - 1, columnLefts.length - 1)]
  if (!Number.isFinite(target)) return 0

  return Math.max(0, Math.min(target - gutter, Math.max(0, maxScroll)))
}
