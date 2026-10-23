/** Picks the active rep with the fewest open chats; ties go to whoever was assigned least recently. */
export function pickRep(
  reps: { id: string; active: boolean }[],
  openCounts: Record<string, number>,
  lastAssignedAt: Record<string, number> = {},
): string | null {
  const pool = reps.filter(r => r.active);
  if (!pool.length) return null;
  return [...pool].sort((a, b) =>
    (openCounts[a.id] ?? 0) - (openCounts[b.id] ?? 0) || (lastAssignedAt[a.id] ?? 0) - (lastAssignedAt[b.id] ?? 0),
  )[0].id;
}
