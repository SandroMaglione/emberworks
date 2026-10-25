/** The player's progress, kept in the browser: which chambers are solved. */
const KEY = "emberworks.progress.v1"

export interface Progress {
  readonly solved: ReadonlySet<string>
}

export const loadProgress = (): Progress => {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return { solved: new Set() }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return { solved: new Set() }
    const solved = (parsed as { readonly solved?: unknown }).solved
    if (!Array.isArray(solved)) return { solved: new Set() }
    return { solved: new Set(solved.filter((id): id is string => typeof id === "string")) }
  } catch {
    return { solved: new Set() }
  }
}

export const saveProgress = (progress: Progress): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ solved: [...progress.solved] }))
  } catch {
    // Private mode or a full store: progress lives for the session only.
  }
}

export const clearProgress = (): void => {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
