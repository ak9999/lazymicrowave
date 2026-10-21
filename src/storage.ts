// Persistence layer: your microwave's wattage and your saved packages.
//
// Data goes in the browser's localStorage (per device, per browser, per site).
// The store takes the storage object as an argument, so tests can pass an in-memory
// one, and the app keeps working (just without persistence) if localStorage is blocked.

import { isValidSeconds, isValidWatts } from "./calc.ts";

export interface SavedPackage {
  id: string;
  name: string;
  /** Wattage the package instructions assume. */
  watts: number;
  /** Cook time printed on the package, in seconds. */
  seconds: number;
  /** Epoch milliseconds of the last save. */
  updatedAt: number;
}

export interface PackageInput {
  /** Pass the id of an existing package to update it; omit to create a new one. */
  id?: string;
  name: string;
  watts: number;
  seconds: number;
}

/** The slice of the Web Storage API we use. `window.localStorage` satisfies it. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ThemePreference = "auto" | "light" | "dark";

/** Type guard: true if `value` is one of the three theme choices. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark";
}

export interface Store {
  /**
   * False if storage is unavailable or a write failed. The app still works, but
   * anything entered is lost when the page closes.
   */
  readonly persistent: boolean;
  /** Your microwave's wattage, or null if none has been saved. */
  getMicrowaveWatts(): number | null;
  /** Saves your microwave's wattage. Throws a RangeError if it is not a valid wattage. */
  setMicrowaveWatts(watts: number): void;
  /** "auto" follows the system setting. */
  getTheme(): ThemePreference;
  /** Saves the theme choice. Throws a RangeError if it is not a valid choice. */
  setTheme(theme: ThemePreference): void;
  /** Sorted by name, case-insensitive. */
  listPackages(): SavedPackage[];
  /** Creates a package, or updates the one with `input.id`. Returns the saved package. */
  savePackage(input: PackageInput): SavedPackage;
  /** Returns false if there was no package with that id. */
  deletePackage(id: string): boolean;
}

export const STORAGE_KEYS = {
  microwave: "lazymicrowave:v1:microwave",
  packages: "lazymicrowave:v1:packages",
  // Also read by public/theme.js, which applies it before first paint. Keep them in sync.
  theme: "lazymicrowave:v1:theme",
} as const;

export const MAX_NAME_LENGTH = 60;

/** A unique id for a new package. Uses a UUID when the browser provides one. */
export function newId(): string {
  const c = globalThis.crypto;
  // randomUUID only exists in secure contexts (https or localhost).
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Creates a store backed by `storage`, loading whatever was saved before. Invalid stored
 * values are ignored. Pass `null` to run without persistence.
 *
 * @param now Clock used to timestamp saves. Injected so tests can control it.
 * @param makeId Generates ids for new packages. Injected so tests can control it.
 */
export function createStore(
  storage: KeyValueStorage | null,
  now: () => number = Date.now,
  makeId: () => string = newId,
): Store {
  let persistent = storage !== null;

  /** Reads and parses a key. Returns undefined if it is missing, unreadable, or not JSON. */
  function load(key: string): unknown {
    if (storage === null) return undefined;
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      persistent = false;
      return undefined;
    }
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined; // corrupt value: ignore it, the next save overwrites it
    }
  }

  /** Writes `value` as JSON. Failures are swallowed and recorded in `persistent`. */
  function save(key: string, value: unknown): void {
    if (storage === null) return;
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      persistent = false; // quota exceeded, private mode, etc.
    }
  }

  const storedWatts = load(STORAGE_KEYS.microwave);
  let microwaveWatts: number | null = isValidWatts(storedWatts) ? storedWatts : null;

  const storedTheme = load(STORAGE_KEYS.theme);
  let theme: ThemePreference = isThemePreference(storedTheme) ? storedTheme : "auto";

  const storedPackages = load(STORAGE_KEYS.packages);
  let packages: SavedPackage[] = Array.isArray(storedPackages)
    ? storedPackages.map(parsePackage).filter((p): p is SavedPackage => p !== null)
    : [];

  return {
    get persistent() {
      return persistent;
    },

    getMicrowaveWatts() {
      return microwaveWatts;
    },

    setMicrowaveWatts(watts) {
      if (!isValidWatts(watts)) throw new RangeError(`Invalid microwave wattage: ${watts}`);
      microwaveWatts = watts;
      save(STORAGE_KEYS.microwave, watts);
    },

    getTheme() {
      return theme;
    },

    setTheme(next) {
      if (!isThemePreference(next)) throw new RangeError(`Invalid theme: ${next}`);
      theme = next;
      save(STORAGE_KEYS.theme, next);
    },

    listPackages() {
      return [...packages].sort(
        (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.updatedAt - b.updatedAt,
      );
    },

    savePackage(input) {
      const name = input.name.trim();
      if (name === "") throw new RangeError("Package name is required");
      if (!isValidWatts(input.watts)) throw new RangeError(`Invalid package wattage: ${input.watts}`);
      if (!isValidSeconds(input.seconds)) throw new RangeError(`Invalid package time: ${input.seconds}`);

      const existing = input.id === undefined ? undefined : packages.find((p) => p.id === input.id);
      const saved: SavedPackage = {
        id: existing?.id ?? makeId(),
        name: name.slice(0, MAX_NAME_LENGTH),
        watts: input.watts,
        seconds: input.seconds,
        updatedAt: now(),
      };
      packages = existing ? packages.map((p) => (p.id === saved.id ? saved : p)) : [...packages, saved];
      save(STORAGE_KEYS.packages, packages);
      return saved;
    },

    deletePackage(id) {
      const before = packages.length;
      packages = packages.filter((p) => p.id !== id);
      if (packages.length === before) return false;
      save(STORAGE_KEYS.packages, packages);
      return true;
    },
  };
}

/** Validate one stored entry. Anything malformed (hand-edited, from an older version) is dropped. */
function parsePackage(raw: unknown): SavedPackage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { id, name, watts, seconds, updatedAt } = raw as Record<string, unknown>;
  if (typeof id !== "string" || id === "") return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (!isValidWatts(watts) || !isValidSeconds(seconds)) return null;
  return {
    id,
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    watts,
    seconds,
    updatedAt: typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}
