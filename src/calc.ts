// Pure conversion logic. No DOM, no storage, so it is easy to test.
//
// Microwave energy delivered is roughly power x time, so to deliver the same
// energy at a different wattage, time scales by (package watts / your watts).

/** Plausible wattage range. Real ovens are roughly 500-2200 W; this is deliberately wider. */
export const MIN_WATTS = 100;
export const MAX_WATTS = 3000;

/** Longest package time we accept: 99:59. */
export const MAX_SECONDS = 99 * 60 + 59;

export function isValidWatts(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_WATTS && value <= MAX_WATTS;
}

export function isValidSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_SECONDS;
}

export function toSeconds(minutes: number, seconds: number): number {
  return minutes * 60 + seconds;
}

/** Above 1 means cook longer than the package says; below 1 means shorter. */
export function powerRatio(packageWatts: number, myWatts: number): number {
  assertWatts(packageWatts, "packageWatts");
  assertWatts(myWatts, "myWatts");
  return packageWatts / myWatts;
}

/** The package time converted for your microwave, in whole seconds (never less than 1). */
export function adjustSeconds(packageSeconds: number, packageWatts: number, myWatts: number): number {
  if (!isValidSeconds(packageSeconds)) {
    throw new RangeError(`packageSeconds must be an integer from 1 to ${MAX_SECONDS}, got ${packageSeconds}`);
  }
  assertWatts(packageWatts, "packageWatts");
  assertWatts(myWatts, "myWatts");
  // Multiply first, then divide once. (45 * 700) / 1000 is exactly 31.5, but
  // 45 * (700 / 1000) is 31.499999999999996 and would round the wrong way.
  return Math.max(1, Math.round((packageSeconds * packageWatts) / myWatts));
}

/** 248 -> "4:08". Minutes are not capped, so 6000 -> "100:00". */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isInteger(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(`totalSeconds must be a non-negative integer, got ${totalSeconds}`);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function assertWatts(value: number, label: string): void {
  if (!isValidWatts(value)) {
    throw new RangeError(`${label} must be an integer from ${MIN_WATTS} to ${MAX_WATTS}, got ${value}`);
  }
}
