/**
 * Who gets a restock alert now. First come, first served, and we alert twice as many buyers as
 * there are units because not everyone who is alerted buys. The rest wait for the next wave.
 */
export function pickWave<T extends { createdAt: Date }>(waiting: T[], units: number, multiplier = 2): T[] {
  if (units <= 0) return [];
  return [...waiting].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(0, units * multiplier);
}
