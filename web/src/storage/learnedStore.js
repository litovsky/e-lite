const STORAGE_KEY = "e-lite.learned.v1";

export function loadLearnedSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function saveLearnedSet(learnedSet) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(learnedSet)));
}
