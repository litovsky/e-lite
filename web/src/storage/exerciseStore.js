const KEY = "e-lite.exercises.v1";

export function loadExercises() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveExercises(entries) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}
