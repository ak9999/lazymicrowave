// UI wiring: reads the form fields, shows the converted time, and manages saved packages.

import {
  MAX_WATTS,
  MIN_WATTS,
  adjustSeconds,
  formatDuration,
  isValidSeconds,
  isValidWatts,
  powerRatio,
  toSeconds,
} from "./calc.ts";
import { createStore, type KeyValueStorage, type SavedPackage, type ThemePreference } from "./storage.ts";

const PRESET_WATTS = [600, 700, 800, 900, 1000, 1100, 1200];

// ---------- Elements ----------

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}

const form = byId<HTMLFormElement>("pkg-form");
const myWattsInput = byId<HTMLInputElement>("my-watts");
const nameInput = byId<HTMLInputElement>("pkg-name");
const pkgWattsInput = byId<HTMLInputElement>("pkg-watts");
const minInput = byId<HTMLInputElement>("pkg-min");
const secInput = byId<HTMLInputElement>("pkg-sec");
const myChips = byId<HTMLElement>("my-chips");
const pkgChips = byId<HTMLElement>("pkg-chips");
const resultEl = byId<HTMLElement>("result");
const resultTime = byId<HTMLElement>("result-time");
const resultDetail = byId<HTMLElement>("result-detail");
const saveButton = byId<HTMLButtonElement>("save");
const cancelButton = byId<HTMLButtonElement>("cancel-edit");
const statusEl = byId<HTMLElement>("status");
const storageWarning = byId<HTMLElement>("storage-warning");
const savedList = byId<HTMLUListElement>("saved-list");
const emptyHint = byId<HTMLElement>("empty");
const themeButtons = document.querySelectorAll<HTMLButtonElement>("#theme-toggle button");

// ---------- State ----------

function openStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage;
    storage.setItem("lazymicrowave:probe", "1");
    storage.removeItem("lazymicrowave:probe");
    return storage;
  } catch {
    return null; // blocked or unavailable
  }
}

const store = createStore(openStorage());

/** Id of the package being edited, or null when the form is creating a new one. */
let editingId: string | null = null;

// ---------- Reading the form ----------

type FieldRead = { ok: true; value: number } | { ok: false; reason: "empty" | "invalid" };

function isBlank(input: HTMLInputElement): boolean {
  // A number input holding text like "e" reports value "" but validity.badInput.
  return input.value.trim() === "" && !input.validity.badInput;
}

function readWatts(input: HTMLInputElement): FieldRead {
  if (isBlank(input)) return { ok: false, reason: "empty" };
  const n = input.valueAsNumber;
  return isValidWatts(n) ? { ok: true, value: n } : { ok: false, reason: "invalid" };
}

/** Minutes and seconds combined. Leaving one of the two blank counts as zero. */
function readDuration(): FieldRead {
  const minBlank = isBlank(minInput);
  const secBlank = isBlank(secInput);
  if (minBlank && secBlank) return { ok: false, reason: "empty" };

  const minutes = minBlank ? 0 : minInput.valueAsNumber;
  const seconds = secBlank ? 0 : secInput.valueAsNumber;
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return { ok: false, reason: "invalid" };
  if (minutes < 0 || seconds < 0 || seconds > 59) return { ok: false, reason: "invalid" };

  const total = toSeconds(minutes, seconds);
  return isValidSeconds(total) ? { ok: true, value: total } : { ok: false, reason: "invalid" };
}

function firstProblem(mw: FieldRead, pw: FieldRead, duration: FieldRead): string {
  if (!mw.ok) {
    return mw.reason === "empty"
      ? "Enter your microwave's wattage to get started."
      : `Your microwave's wattage should be between ${MIN_WATTS} and ${MAX_WATTS} W.`;
  }
  if (!pw.ok) {
    return pw.reason === "empty"
      ? "Enter the wattage the package assumes."
      : `The package's wattage should be between ${MIN_WATTS} and ${MAX_WATTS} W.`;
  }
  if (!duration.ok) {
    return duration.reason === "empty"
      ? "Enter the cook time from the package."
      : "Time should be between 0:01 and 99:59, with seconds under 60.";
  }
  return "";
}

// ---------- Rendering ----------

function renderResult(): void {
  const mw = readWatts(myWattsInput);
  const pw = readWatts(pkgWattsInput);
  const duration = readDuration();

  if (mw.ok && pw.ok && duration.ok) {
    const adjusted = adjustSeconds(duration.value, pw.value, mw.value);
    const ratio = powerRatio(pw.value, mw.value);
    resultEl.dataset["state"] = "ready";
    resultTime.textContent = formatDuration(adjusted);
    resultDetail.textContent =
      `${formatDuration(duration.value)} at ${pw.value} W → ` +
      `${formatDuration(adjusted)} at ${mw.value} W (×${ratio.toFixed(2)})`;
  } else {
    resultEl.dataset["state"] = "idle";
    resultTime.textContent = "--:--";
    resultDetail.textContent = firstProblem(mw, pw, duration);
  }

  // A package can be saved without knowing your own wattage.
  saveButton.disabled = nameInput.value.trim() === "" || !pw.ok || !duration.ok;
  syncChips(myChips, mw.ok ? mw.value : null);
  syncChips(pkgChips, pw.ok ? pw.value : null);
}

function renderChips(container: HTMLElement, input: HTMLInputElement): void {
  for (const watts of PRESET_WATTS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = String(watts);
    chip.dataset["watts"] = String(watts);
    chip.setAttribute("aria-label", `${watts} watts`);
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      input.value = String(watts);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    container.append(chip);
  }
}

function syncChips(container: HTMLElement, selected: number | null): void {
  for (const chip of container.querySelectorAll<HTMLButtonElement>(".chip")) {
    chip.setAttribute("aria-pressed", String(chip.dataset["watts"] === String(selected)));
  }
}

function renderList(): void {
  const mw = readWatts(myWattsInput);
  const packages = store.listPackages();
  emptyHint.hidden = packages.length > 0;
  savedList.replaceChildren(...packages.map((p) => renderItem(p, mw.ok ? mw.value : null)));
}

function renderItem(pkg: SavedPackage, myWatts: number | null): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "saved-item";

  const name = document.createElement("p");
  name.className = "saved-name";
  name.textContent = pkg.name;

  const meta = document.createElement("p");
  meta.className = "saved-meta";
  meta.textContent = `${formatDuration(pkg.seconds)} at ${pkg.watts} W on the package`;

  // The time for *your* microwave, recomputed every render so it follows changes to your wattage.
  const time = document.createElement("p");
  time.className = "saved-time";
  const spoken = document.createElement("span");
  spoken.className = "sr-only";
  if (myWatts === null) {
    spoken.textContent = "Enter your microwave's wattage to see the time. ";
    time.append(spoken, "--:--");
  } else {
    spoken.textContent = "Cook for ";
    time.append(spoken, formatDuration(adjustSeconds(pkg.seconds, pkg.watts, myWatts)));
  }

  const actions = document.createElement("div");
  actions.className = "saved-actions";
  actions.append(
    textButton("Edit", "link", `Edit ${pkg.name}`, () => startEdit(pkg)),
    textButton("Delete", "link danger", `Delete ${pkg.name}`, () => deletePackage(pkg)),
  );

  li.append(name, time, meta, actions);
  return li;
}

function textButton(label: string, className: string, ariaLabel: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  button.addEventListener("click", onClick);
  return button;
}

let statusTimer: number | undefined;

function setStatus(message: string): void {
  statusEl.textContent = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    statusEl.textContent = "";
  }, 4000);
}

function renderStorageWarning(): void {
  storageWarning.hidden = store.persistent;
}

// ---------- Theme ----------

/** Mirrors the theme-color tags in index.html. */
const THEME_COLORS = { light: "#fbf6ee", dark: "#17130f" } as const;

function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset["theme"];
  else root.dataset["theme"] = theme;

  // The browser toolbar colour should match a forced theme, not the system one.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLORS[theme === "auto" ? scheme : theme];
  }

  for (const button of themeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset["theme"] === theme));
  }
}

// ---------- Actions ----------

function savePackage(): void {
  const pw = readWatts(pkgWattsInput);
  const duration = readDuration();
  const name = nameInput.value.trim();
  if (name === "" || !pw.ok || !duration.ok) return;

  const wasEditing = editingId !== null;
  const saved = store.savePackage({ id: editingId ?? undefined, name, watts: pw.value, seconds: duration.value });
  resetForm();
  renderList();
  renderStorageWarning();
  setStatus(`${wasEditing ? "Updated" : "Saved"} “${saved.name}”.`);

  // Ask the browser not to evict our data when it is short on space. Best effort.
  navigator.storage?.persist?.().catch(() => undefined);
}

function startEdit(pkg: SavedPackage): void {
  editingId = pkg.id;
  nameInput.value = pkg.name;
  pkgWattsInput.value = String(pkg.watts);
  minInput.value = String(Math.floor(pkg.seconds / 60));
  secInput.value = String(pkg.seconds % 60);
  saveButton.textContent = "Update package";
  cancelButton.hidden = false;
  renderResult();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function deletePackage(pkg: SavedPackage): void {
  if (!window.confirm(`Delete “${pkg.name}”?`)) return;
  store.deletePackage(pkg.id);
  if (editingId === pkg.id) resetForm();
  renderList();
  renderStorageWarning();
  setStatus(`Deleted “${pkg.name}”.`);
}

function resetForm(): void {
  editingId = null;
  nameInput.value = "";
  pkgWattsInput.value = "";
  minInput.value = "";
  secInput.value = "";
  saveButton.textContent = "Save package";
  cancelButton.hidden = true;
  renderResult();
}

// ---------- Wiring ----------

myWattsInput.addEventListener("input", () => {
  const mw = readWatts(myWattsInput);
  if (mw.ok) {
    store.setMicrowaveWatts(mw.value);
    renderStorageWarning();
  }
  renderResult();
  renderList(); // saved packages show the time for the current wattage
});

for (const input of [nameInput, pkgWattsInput, minInput, secInput]) {
  input.addEventListener("input", renderResult);
}

for (const button of themeButtons) {
  button.addEventListener("click", () => {
    const theme = button.dataset["theme"];
    if (theme !== "auto" && theme !== "light" && theme !== "dark") return;
    store.setTheme(theme);
    applyTheme(theme);
    renderStorageWarning();
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  savePackage();
});

cancelButton.addEventListener("click", () => {
  resetForm();
  setStatus("Edit cancelled.");
});

renderChips(myChips, myWattsInput);
renderChips(pkgChips, pkgWattsInput);

const savedWatts = store.getMicrowaveWatts();
if (savedWatts !== null) myWattsInput.value = String(savedWatts);

applyTheme(store.getTheme());
renderResult();
renderList();
renderStorageWarning();

// ---------- Offline support ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error: unknown) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}
