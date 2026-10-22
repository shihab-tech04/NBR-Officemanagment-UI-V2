/**
 * Reproducible, ILLUSTRATIVE weights for the Audit Overview prototype.
 *
 * The repository contains representative return/case fixtures, not a live NBR
 * population data feed. A scenario target is NOT a verified taxpayer count.
 * Every screen lens reuses the same row weights; never re-project each tab
 * independently or claim that drill-down sample rows number in the millions.
 *
 * No tax, legal, risk or individual audit decisions may use these weights.
 */
export function scenarioWeights<T>(
  rows: readonly T[],
  target: number,
  identity: (row: T) => string,
): Map<string, number> {
  if (!Number.isSafeInteger(target) || target < 0) throw new Error("Invalid scenario target");
  const sorted = [...rows].map((row) => ({ row, id: identity(row) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (sorted.some(({ id }) => !id) || new Set(sorted.map(({ id }) => id)).size !== sorted.length) {
    throw new Error("Scenario fixtures require unique non-empty stable identifiers");
  }
  if (!sorted.length) return new Map();
  // Stable integer variation avoids 1/36, 2/36 etc masquerading as published
  // national distributions. This variation is synthetic, not statistically
  // calibrated and never provides an evidentiary risk multiplier.
  const raw = sorted.map(({ id }) => {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    }
    return 500 + ((hash >>> 0) % 1951);
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  const normalized = raw.map((value, index) => {
    const numerator = value * target;
    const whole = Math.floor(numerator / sum);
    return { id: sorted[index].id, value: whole, residue: numerator % sum };
  });
  let outstanding = target - normalized.reduce((a, b) => a + b.value, 0);
  const remainderOrder = [...normalized].sort(
    (a, b) => b.residue - a.residue || a.id.localeCompare(b.id),
  );
  for (let i = 0; i < outstanding; i++) remainderOrder[i].value += 1;
  return new Map(normalized.map(({ id, value }) => [id, value]));
}

export function scenarioSum<T>(
  rows: readonly T[],
  weights: ReadonlyMap<string, number>,
  identity: (row: T) => string,
): number {
  return rows.reduce((total, row) => total + (weights.get(identity(row)) ?? 0), 0);
}

export function scenarioGroupCounts<T>(
  rows: readonly T[],
  weights: ReadonlyMap<string, number>,
  identity: (row: T) => string,
  groupValues: (row: T) => readonly string[],
): Map<string, number> {
  const result = new Map<string, number>();
  rows.forEach((row) => {
    const value = weights.get(identity(row)) ?? 0;
    // A single return may match several independent signals. Count the return
    // once per distinct signal, never once per duplicate occurrence.
    new Set(groupValues(row)).forEach((key) => {
      result.set(key, (result.get(key) ?? 0) + value);
    });
  });
  return result;
}
