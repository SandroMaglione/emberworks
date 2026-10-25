/**
 * The works: one machine in cross-section, each room a part of it and each
 * chamber a porthole. A solved porthole glows; a room whose chambers are all
 * lit turns its gear.
 */
import { LEVELS, ROOMS } from "../sim/levels.ts"
import type { Progress } from "./save.ts"

export interface ShellActions {
  readonly open: (levelId: string) => void
  readonly reset: () => void
  /** Whether a chamber may be opened; the host may open everything while developing. */
  readonly unlocked: (progress: Progress, levelId: string) => boolean
}

const gear = (teeth: number, color: string): string => {
  const points: Array<string> = []
  const outer = 36
  const inner = 29
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2
    const r = i % 2 === 0 ? outer : inner
    points.push(`${(40 + Math.cos(a) * r).toFixed(1)},${(40 + Math.sin(a) * r).toFixed(1)}`)
  }
  return `<svg viewBox="0 0 80 80"><polygon points="${points.join(" ")}" fill="${color}" /><circle cx="40" cy="40" r="17" fill="#141619" /><circle cx="40" cy="40" r="6" fill="${color}" /></svg>`
}

export class Shell {
  private readonly root: HTMLElement
  private readonly actions: ShellActions
  private current: string | null = null

  constructor(root: HTMLElement, actions: ShellActions) {
    this.root = root
    this.actions = actions
  }

  show(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible)
  }

  /** The first chamber not yet solved, in the order of play. */
  static nextOpen(progress: Progress): string {
    return LEVELS.find((level) => !progress.solved.has(level.id))?.id ?? LEVELS[LEVELS.length - 1]?.id ?? "1-1"
  }

  static unlocked(progress: Progress, levelId: string): boolean {
    const at = LEVELS.findIndex((level) => level.id === levelId)
    if (at <= 0) return true
    const previous = LEVELS[at - 1]
    return previous === undefined || progress.solved.has(previous.id)
  }

  render(progress: Progress, current: string | null): void {
    this.current = current
    const inner = document.createElement("div")
    inner.className = "inner"
    const title = document.createElement("h1")
    title.textContent = "Emberworks"
    const sub = document.createElement("div")
    sub.className = "sub"
    const solvedCount = LEVELS.filter((level) => progress.solved.has(level.id)).length
    sub.textContent = solvedCount === LEVELS.length ? "The works are awake." : `${solvedCount} of ${LEVELS.length} chambers lit`
    inner.append(title, sub)
    ROOMS.forEach((room, roomIndex) => {
      const section = document.createElement("section")
      const awake = room.levels.every((level) => progress.solved.has(level.id))
      const open = room.levels.some((level) => this.actions.unlocked(progress, level.id))
      section.className = `room${awake ? " awake" : ""}${open ? "" : " locked"}`
      const gearBox = document.createElement("div")
      gearBox.className = "gear"
      gearBox.innerHTML = gear(8 + roomIndex * 2, awake ? "#ffd27a" : open ? "#c99a3b" : "#4a3914")
      const body = document.createElement("div")
      const heading = document.createElement("h2")
      heading.textContent = room.name
      const ports = document.createElement("div")
      ports.className = "ports"
      room.levels.forEach((level) => {
        const button = document.createElement("button")
        const solved = progress.solved.has(level.id)
        const unlocked = this.actions.unlocked(progress, level.id)
        button.className = `port${solved ? " solved" : unlocked ? " open" : " locked"}${level.id === this.current ? " current" : ""}`
        button.textContent = String(LEVELS.findIndex((entry) => entry.id === level.id) + 1)
        button.title = level.name
        button.disabled = !unlocked
        button.addEventListener("click", () => this.actions.open(level.id))
        ports.append(button)
      })
      body.append(heading, ports)
      const conduit = document.createElement("div")
      conduit.className = "conduit"
      section.append(gearBox, body, conduit)
      inner.append(section)
    })
    const how = document.createElement("p")
    how.className = "how"
    how.innerHTML = "Tap a relay to turn it. Hold it (or right-click) to lock it in place.<br />Every striker must land on a relay, and every socket must be struck. Then pull the lever."
    const reset = document.createElement("button")
    reset.className = "btn"
    reset.textContent = "Forget my progress"
    reset.style.marginTop = "28px"
    reset.addEventListener("click", () => {
      if (window.confirm("Forget every lit chamber and start the works cold?")) this.actions.reset()
    })
    const footer = document.createElement("div")
    footer.style.textAlign = "center"
    footer.append(reset)
    inner.append(how, footer)
    this.root.replaceChildren(inner)
  }
}
