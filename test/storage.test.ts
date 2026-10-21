import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STORAGE_KEYS, createStore, type KeyValueStorage } from "../src/storage.ts";

/** An in-memory KeyValueStorage. `data` exposes the raw contents so tests can inspect them. */
function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

/** Returns an id generator that yields "id-1", "id-2", and so on, for predictable test output. */
const sequentialIds = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe("microwave wattage", () => {
  it("starts unset", () => {
    assert.equal(createStore(memoryStorage()).getMicrowaveWatts(), null);
  });

  it("survives a reload", () => {
    const storage = memoryStorage();
    createStore(storage).setMicrowaveWatts(900);
    assert.equal(createStore(storage).getMicrowaveWatts(), 900);
  });

  it("rejects invalid wattage", () => {
    const store = createStore(memoryStorage());
    assert.throws(() => store.setMicrowaveWatts(50), RangeError);
    assert.throws(() => store.setMicrowaveWatts(1000.5), RangeError);
    assert.equal(store.getMicrowaveWatts(), null);
  });

  it("ignores an out-of-range stored value", () => {
    const storage = memoryStorage({ [STORAGE_KEYS.microwave]: "50" });
    assert.equal(createStore(storage).getMicrowaveWatts(), null);
  });
});

describe("packages", () => {
  it("saves, lists and reloads packages", () => {
    const storage = memoryStorage();
    const store = createStore(storage, () => 1000, sequentialIds());
    const saved = store.savePackage({ name: "Mac & cheese cup", watts: 1100, seconds: 180 });

    assert.deepEqual(saved, { id: "id-1", name: "Mac & cheese cup", watts: 1100, seconds: 180, updatedAt: 1000 });
    assert.deepEqual(createStore(storage).listPackages(), [saved]);
  });

  it("updates in place when given an existing id", () => {
    let clock = 1;
    const store = createStore(memoryStorage(), () => clock, sequentialIds());
    const first = store.savePackage({ name: "Soup", watts: 1000, seconds: 120 });
    clock = 2;
    const updated = store.savePackage({ id: first.id, name: "Tomato soup", watts: 1000, seconds: 150 });

    assert.equal(updated.id, first.id);
    assert.equal(updated.updatedAt, 2);
    assert.deepEqual(store.listPackages(), [updated]);
  });

  it("creates a new package when the given id is unknown", () => {
    const store = createStore(memoryStorage(), () => 1, sequentialIds());
    const saved = store.savePackage({ id: "gone", name: "Soup", watts: 1000, seconds: 120 });
    assert.equal(saved.id, "id-1");
    assert.equal(store.listPackages().length, 1);
  });

  it("sorts by name, ignoring case", () => {
    const store = createStore(memoryStorage(), () => 1, sequentialIds());
    for (const name of ["banana bread", "Apple pie", "cherry tart"]) {
      store.savePackage({ name, watts: 1000, seconds: 60 });
    }
    assert.deepEqual(
      store.listPackages().map((p) => p.name),
      ["Apple pie", "banana bread", "cherry tart"],
    );
  });

  it("trims names and caps their length", () => {
    const store = createStore(memoryStorage());
    assert.equal(store.savePackage({ name: "  Soup  ", watts: 1000, seconds: 60 }).name, "Soup");
    assert.equal(store.savePackage({ name: "x".repeat(200), watts: 1000, seconds: 60 }).name.length, 60);
  });

  it("deletes packages", () => {
    const storage = memoryStorage();
    const store = createStore(storage, () => 1, sequentialIds());
    const saved = store.savePackage({ name: "Soup", watts: 1000, seconds: 60 });

    assert.equal(store.deletePackage("nope"), false);
    assert.equal(store.deletePackage(saved.id), true);
    assert.deepEqual(store.listPackages(), []);
    assert.deepEqual(createStore(storage).listPackages(), []);
  });

  it("rejects invalid input", () => {
    const store = createStore(memoryStorage());
    assert.throws(() => store.savePackage({ name: "   ", watts: 1000, seconds: 60 }), RangeError);
    assert.throws(() => store.savePackage({ name: "Soup", watts: 5, seconds: 60 }), RangeError);
    assert.throws(() => store.savePackage({ name: "Soup", watts: 1000, seconds: 0 }), RangeError);
    assert.deepEqual(store.listPackages(), []);
  });
});

describe("bad storage contents", () => {
  it("ignores corrupt JSON", () => {
    const storage = memoryStorage({ [STORAGE_KEYS.packages]: "{not json" });
    assert.deepEqual(createStore(storage).listPackages(), []);
  });

  it("ignores a stored value that is not an array", () => {
    const storage = memoryStorage({ [STORAGE_KEYS.packages]: '{"id":"a"}' });
    assert.deepEqual(createStore(storage).listPackages(), []);
  });

  it("keeps valid entries and drops malformed ones", () => {
    const entries = [
      { id: "a", name: "Good", watts: 1100, seconds: 180, updatedAt: 5 },
      { id: "b" },
      { id: "c", name: "Bad watts", watts: 5, seconds: 60, updatedAt: 1 },
      { id: "", name: "No id", watts: 1000, seconds: 60, updatedAt: 1 },
      { id: "d", name: "   ", watts: 1000, seconds: 60, updatedAt: 1 },
      null,
      5,
    ];
    const storage = memoryStorage({ [STORAGE_KEYS.packages]: JSON.stringify(entries) });
    assert.deepEqual(
      createStore(storage).listPackages().map((p) => p.id),
      ["a"],
    );
  });

  it("defaults a missing updatedAt to 0", () => {
    const entry = { id: "a", name: "Old", watts: 1000, seconds: 60 };
    const storage = memoryStorage({ [STORAGE_KEYS.packages]: JSON.stringify([entry]) });
    assert.equal(createStore(storage).listPackages()[0]?.updatedAt, 0);
  });
});

describe("unavailable storage", () => {
  it("works in memory when there is no storage at all", () => {
    const store = createStore(null, () => 1, sequentialIds());
    assert.equal(store.persistent, false);
    store.setMicrowaveWatts(900);
    store.savePackage({ name: "Soup", watts: 1000, seconds: 60 });
    assert.equal(store.getMicrowaveWatts(), 900);
    assert.equal(store.listPackages().length, 1);
  });

  it("works in memory when every storage call throws", () => {
    const denied: KeyValueStorage = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    };
    const store = createStore(denied, () => 1, sequentialIds());
    assert.equal(store.persistent, false);
    store.savePackage({ name: "Soup", watts: 1000, seconds: 60 });
    assert.equal(store.listPackages().length, 1);
  });

  it("reports persistent: false after a failed write, but keeps the data", () => {
    const full: KeyValueStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("QuotaExceededError");
      },
    };
    const store = createStore(full, () => 1, sequentialIds());
    assert.equal(store.persistent, true);
    store.savePackage({ name: "Soup", watts: 1000, seconds: 60 });
    assert.equal(store.persistent, false);
    assert.equal(store.listPackages().length, 1);
  });
});

describe("theme preference", () => {
  it("defaults to auto", () => {
    assert.equal(createStore(memoryStorage()).getTheme(), "auto");
  });

  it("persists across stores", () => {
    const storage = memoryStorage();
    createStore(storage).setTheme("dark");
    assert.equal(createStore(storage).getTheme(), "dark");
  });

  it("ignores an invalid stored value and rejects an invalid new one", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEYS.theme, JSON.stringify("purple"));
    const store = createStore(storage);
    assert.equal(store.getTheme(), "auto");
    assert.throws(() => store.setTheme("purple" as never), RangeError);
  });
});
