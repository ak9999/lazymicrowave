import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_SECONDS,
  adjustSeconds,
  formatDuration,
  isValidSeconds,
  isValidWatts,
  powerRatio,
  toSeconds,
} from "../src/calc.ts";

describe("adjustSeconds", () => {
  it("cooks longer in a weaker microwave", () => {
    // 3:00 at 1100 W -> 180 * 1100 / 800 = 247.5 -> 248 s (4:08)
    assert.equal(adjustSeconds(180, 1100, 800), 248);
  });

  it("cooks shorter in a stronger microwave", () => {
    // 180 * 800 / 1100 = 130.9 -> 131 s
    assert.equal(adjustSeconds(180, 800, 1100), 131);
  });

  it("leaves the time alone when the wattages match", () => {
    assert.equal(adjustSeconds(95, 1000, 1000), 95);
  });

  it("rounds to the nearest second", () => {
    // 90 * 1000 / 700 = 128.57 -> 129
    assert.equal(adjustSeconds(90, 1000, 700), 129);
  });

  it("rounds exact halves up, without floating-point drift", () => {
    // 45 * 700 / 1000 = 31.5 exactly. Computing 45 * (700 / 1000) gives 31.499999999999996.
    assert.equal(adjustSeconds(45, 700, 1000), 32);
    // 15 * 1100 / 1000 = 16.5 exactly
    assert.equal(adjustSeconds(15, 1100, 1000), 17);
  });

  it("never returns less than one second", () => {
    // 1 * 1000 / 3000 = 0.33 would round to 0
    assert.equal(adjustSeconds(1, 1000, 3000), 1);
  });

  it("rejects invalid input", () => {
    assert.throws(() => adjustSeconds(0, 1000, 1000), RangeError);
    assert.throws(() => adjustSeconds(-5, 1000, 1000), RangeError);
    assert.throws(() => adjustSeconds(1.5, 1000, 1000), RangeError);
    assert.throws(() => adjustSeconds(MAX_SECONDS + 1, 1000, 1000), RangeError);
    assert.throws(() => adjustSeconds(60, 0, 1000), RangeError);
    assert.throws(() => adjustSeconds(60, 1000, 0), RangeError);
    assert.throws(() => adjustSeconds(60, 1000, Number.NaN), RangeError);
    assert.throws(() => adjustSeconds(60, Number.POSITIVE_INFINITY, 1000), RangeError);
  });
});

describe("powerRatio", () => {
  it("is package watts divided by your watts", () => {
    assert.equal(powerRatio(1200, 600), 2);
    assert.equal(powerRatio(600, 1200), 0.5);
  });

  it("rejects out-of-range wattage", () => {
    assert.throws(() => powerRatio(99, 1000), RangeError);
    assert.throws(() => powerRatio(1000, 3001), RangeError);
  });
});

describe("formatDuration", () => {
  it("formats minutes and zero-padded seconds", () => {
    assert.equal(formatDuration(0), "0:00");
    assert.equal(formatDuration(5), "0:05");
    assert.equal(formatDuration(59), "0:59");
    assert.equal(formatDuration(60), "1:00");
    assert.equal(formatDuration(248), "4:08");
    assert.equal(formatDuration(3599), "59:59");
  });

  it("does not cap minutes", () => {
    assert.equal(formatDuration(6000), "100:00");
  });

  it("rejects negative and fractional values", () => {
    assert.throws(() => formatDuration(-1), RangeError);
    assert.throws(() => formatDuration(1.5), RangeError);
    assert.throws(() => formatDuration(Number.NaN), RangeError);
  });
});

describe("toSeconds", () => {
  it("combines minutes and seconds", () => {
    assert.equal(toSeconds(3, 30), 210);
    assert.equal(toSeconds(0, 45), 45);
  });
});

describe("validators", () => {
  it("accepts integer wattages in range only", () => {
    assert.equal(isValidWatts(1000), true);
    assert.equal(isValidWatts(100), true);
    assert.equal(isValidWatts(3000), true);
    assert.equal(isValidWatts(99), false);
    assert.equal(isValidWatts(3001), false);
    assert.equal(isValidWatts(1000.5), false);
    assert.equal(isValidWatts("1000"), false);
    assert.equal(isValidWatts(null), false);
  });

  it("accepts 1 second up to 99:59", () => {
    assert.equal(isValidSeconds(1), true);
    assert.equal(isValidSeconds(MAX_SECONDS), true);
    assert.equal(isValidSeconds(0), false);
    assert.equal(isValidSeconds(MAX_SECONDS + 1), false);
    assert.equal(isValidSeconds(Number.NaN), false);
  });
});
