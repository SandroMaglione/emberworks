/**
 * The HUD over the chamber: the way back to the works, the chamber's name,
 * undo and restart, and the lever. Plain DOM; it mirrors the view and sends
 * intents back through callbacks.
 */
import { LEVELS, roomOf } from "../sim/levels.ts"
import type { ChamberView } from "../sim/view.ts"

export interface HudActions {
  readonly back: () => void
  readonly undo: () => void
  readonly restart: () => void
  readonly lever: () => void
  readonly next: () => void
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  node.className = className
  if (text !== "") node.textContent = text
  return node
}

export class Hud {
  private readonly title: HTMLElement
  private readonly undo: HTMLButtonElement
  private readonly restart: HTMLButtonElement
  private readonly lever: HTMLButtonElement
  private readonly note: HTMLElement
  private readonly root: HTMLElement
  private lastLevel: string | null = null

  constructor(root: HTMLElement, actions: HudActions) {
    this.root = root
    const bar = el("div", "bar")
    const back = el("button", "btn", "◂ Works")
    back.addEventListener("click", actions.back)
    this.title = el("div", "title")
    const group = el("div", "group")
    this.undo = el("button", "btn")
    this.undo.innerHTML = "Undo<kbd>U</kbd>"
    this.undo.addEventListener("click", actions.undo)
    this.restart = el("button", "btn")
    this.restart.innerHTML = "Restart<kbd>R</kbd>"
    this.restart.addEventListener("click", actions.restart)
    group.append(this.undo, this.restart)
    bar.append(back, this.title, group)
    const foot = el("div", "foot")
    this.note = el("div", "note")
    this.lever = el("button", "lever", "Strike")
    this.lever.addEventListener("click", () => {
      if (this.lever.classList.contains("next")) actions.next()
      else actions.lever()
    })
    foot.append(this.note, this.lever)
    root.append(bar, foot)
  }

  show(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible)
  }

  step(view: ChamberView, hasNext: boolean): void {
    const level = view.level
    if (level === null) return
    if (level.id !== this.lastLevel) {
      this.lastLevel = level.id
      const room = roomOf(level.id)
      const number = LEVELS.findIndex((entry) => entry.id === level.id) + 1
      this.title.innerHTML = `${room?.name ?? ""} · ${number}<b>${level.name}</b>`
    }
    const editing = view.phase.tag === "Editing"
    this.undo.disabled = !editing || !view.canUndo
    this.restart.disabled = !editing
    this.lever.classList.toggle("down", view.phase.tag === "Firing" || view.phase.tag === "Settling")
    this.lever.classList.toggle("next", view.phase.tag === "Solved")
    switch (view.phase.tag) {
      case "Editing":
        this.lever.textContent = "Strike"
        // The first chamber says the two things the board cannot: pull, then turn.
        this.note.innerHTML = level.id === "1-1" ? (view.strikes === 0 ? "Pull the lever." : "Tap the ember to turn it, then pull again.") : "&nbsp;"
        break
      case "Firing":
        this.lever.textContent = "Skip"
        this.note.innerHTML = "&nbsp;"
        break
      case "Settling": {
        this.lever.textContent = "Tap to continue"
        const firing = view.firing
        const parts: Array<string> = []
        if (firing !== null) {
          const wasted = firing.waves.reduce((n, wave) => n + wave.sparks.filter((spark) => spark.outcome === "wasted").length, 0)
          const shorted = firing.waves.reduce((n, wave) => n + wave.sparks.filter((spark) => spark.outcome === "short").length, 0)
          if (wasted > 0) parts.push(`<span class="fault">${wasted} wasted</span>`)
          if (shorted > 0) parts.push(`<span class="fault">${shorted} shorted</span>`)
          if (firing.starved.length > 0) parts.push(`<span class="fault">${firing.starved.length} half-charged</span>`)
          if (firing.dark.length > 0) parts.push(`<span class="fault">${firing.dark.length} dark</span>`)
        }
        this.note.innerHTML = parts.join(" · ") || "&nbsp;"
        break
      }
      case "Solved":
        this.lever.textContent = hasNext ? "Next chamber ▸" : "Back to the works"
        this.note.innerHTML = `<span class="warm">The chamber is lit.</span>`
        break
    }
  }
}
