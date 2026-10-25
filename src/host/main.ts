/**
 * The browser host: a fixed 60 Hz loop over the simulation, the pointer and
 * keys turned into intents, Pixi drawing the chamber, DOM for the HUD and the
 * works, synthesised sound, and progress in local storage.
 */
import { Clock, FixedLoop } from "@typeonce/ritmo"
import * as Result from "@typeonce/ritmo/Result"
import { BrowserTickSource } from "@typeonce/ritmo-browser"

import { nextLevelId } from "../sim/levels.ts"
import { IntentEvent, type Intent } from "../sim/schema.ts"
import { createSimulation } from "../sim/simulation.ts"
import { ChamberInspector, type ChamberView } from "../sim/view.ts"
import { Sound } from "./audio.ts"
import { Hud } from "./hud.ts"
import { cellAt } from "./layout.ts"
import { Renderer } from "./render.ts"
import { loadProgress, saveProgress, clearProgress, type Progress } from "./save.ts"
import { Shell } from "./shell.ts"

const STEP = Clock.hz(60)
const STEP_MS = 1000 / 60
/** Holding a relay this long locks it instead of turning it. */
const HOLD_MS = 420

const app = document.getElementById("app")
const hudRoot = document.getElementById("hud")
const shellRoot = document.getElementById("shell")
if (app === null || hudRoot === null || shellRoot === null) throw new Error("missing #app, #hud or #shell")

const renderer = await Renderer.create(app)
const sound = new Sound()
const simulation = createSimulation()
const { runtime } = simulation

let progress: Progress = loadProgress()
/** `?all` opens every chamber, to look at any of them while making the game. */
const everything = new URL(window.location.href).searchParams.has("all")
const unlocked = (levelId: string): boolean => everything || Shell.unlocked(progress, levelId)
let current: string | null = null
let inWorks = true
let latest: ChamberView = runtime.inspect(ChamberInspector)

const send = (intent: Intent): void => {
  sound.unlock()
  runtime.send(IntentEvent, intent)
}

const showWorks = (): void => {
  inWorks = true
  shell.render(progress, current)
  shell.show(true)
  hud.show(false)
}

const open = (levelId: string): void => {
  if (!unlocked(levelId)) return
  current = levelId
  inWorks = false
  send({ kind: "load", levelId })
  shell.show(false)
  hud.show(true)
  const url = new URL(window.location.href)
  url.searchParams.set("chamber", levelId)
  if (everything) url.searchParams.set("all", "")
  window.history.replaceState(null, "", url)
}

const hud = new Hud(hudRoot, {
  back: showWorks,
  undo: () => send({ kind: "undo" }),
  restart: () => send({ kind: "restart" }),
  lever: () => {
    if (latest.phase.tag === "Editing") send({ kind: "strike" })
    else if (latest.phase.tag === "Firing") send({ kind: "skip" })
    else if (latest.phase.tag === "Settling") send({ kind: "skip" })
  },
  next: () => {
    const next = current === null ? undefined : nextLevelId(current)
    if (next !== undefined) open(next)
    else showWorks()
  }
})

const shell = new Shell(shellRoot, {
  open,
  unlocked: (_progress, levelId) => unlocked(levelId),
  reset: () => {
    clearProgress()
    progress = loadProgress()
    shell.render(progress, current)
  }
})

// The pointer: a tap turns, a hold locks, the secondary button locks.
let pressedCell = -1
let pressedAt = 0
let holdTimer: number | null = null
let holdFired = false

const cellUnder = (event: PointerEvent): number => {
  const level = latest.level
  const layout = renderer.currentLayout
  if (level === null || layout === null) return -1
  const rect = renderer.app.canvas.getBoundingClientRect()
  return cellAt(level, layout, event.clientX - rect.left, event.clientY - rect.top)
}

const clearHold = (): void => {
  if (holdTimer !== null) window.clearTimeout(holdTimer)
  holdTimer = null
}

renderer.app.canvas.addEventListener("pointerdown", (event) => {
  sound.unlock()
  if (inWorks) return
  event.preventDefault()
  const cell = cellUnder(event)
  if (latest.phase.tag === "Settling") {
    send({ kind: "skip" })
    return
  }
  if (latest.phase.tag !== "Editing" || cell < 0) return
  pressedCell = cell
  pressedAt = performance.now()
  holdFired = false
  renderer.setHover({ cell, down: true })
  if (event.button === 2) {
    send({ kind: "lock", cell })
    holdFired = true
    return
  }
  clearHold()
  holdTimer = window.setTimeout(() => {
    holdFired = true
    send({ kind: "lock", cell })
  }, HOLD_MS)
})
renderer.app.canvas.addEventListener("pointerup", (event) => {
  if (inWorks) return
  clearHold()
  const cell = cellUnder(event)
  if (!holdFired && cell >= 0 && cell === pressedCell && performance.now() - pressedAt < HOLD_MS && latest.phase.tag === "Editing") {
    renderer.pressed(cell)
    send({ kind: "rotate", cell })
  }
  pressedCell = -1
  renderer.setHover(cell >= 0 ? { cell, down: false } : null)
})
renderer.app.canvas.addEventListener("pointermove", (event) => {
  if (inWorks) return
  const cell = cellUnder(event)
  if (pressedCell >= 0 && cell !== pressedCell) {
    // Dragged off the relay: neither a tap nor a hold.
    clearHold()
    pressedCell = -1
    holdFired = true
  }
  renderer.setHover(cell >= 0 ? { cell, down: pressedCell === cell } : null)
})
renderer.app.canvas.addEventListener("pointercancel", () => {
  clearHold()
  pressedCell = -1
})
renderer.app.canvas.addEventListener("pointerleave", () => renderer.setHover(null))
renderer.app.canvas.addEventListener("contextmenu", (event) => event.preventDefault())

window.addEventListener("keydown", (event) => {
  if (event.repeat) return
  sound.unlock()
  if (event.key === "Escape") {
    if (inWorks) {
      if (current !== null) open(current)
    } else showWorks()
    return
  }
  if (inWorks) return
  if (latest.phase.tag === "Settling") {
    send({ kind: "skip" })
    return
  }
  switch (event.key.toLowerCase()) {
    case " ":
    case "enter":
      event.preventDefault()
      if (latest.phase.tag === "Editing") send({ kind: "strike" })
      else if (latest.phase.tag === "Firing") send({ kind: "skip" })
      else if (latest.phase.tag === "Solved") {
        const next = current === null ? undefined : nextLevelId(current)
        if (next !== undefined) open(next)
        else showWorks()
      }
      break
    case "u":
    case "z":
      send({ kind: "undo" })
      break
    case "r":
      send({ kind: "restart" })
      break
    case "m":
      sound.muted = !sound.muted
      break
  }
})

const onSolved = (): void => {
  if (current === null || progress.solved.has(current)) return
  progress = { solved: new Set([...progress.solved, current]) }
  saveProgress(progress)
}

const source = FixedLoop.source((onTick) => BrowserTickSource.make(window).subscribe((tick) => onTick({ deltaMS: tick.deltaMS })))

let lastDraw = performance.now()
const loop = FixedLoop.start({
  source,
  step: STEP,
  maxFrameSeconds: 0.25,
  maxStepsPerFrame: 5,
  update: () => {
    const ran = runtime.tick(simulation.update)
    if (!ran.ok) return Result.failure(ran.error)
    latest = runtime.inspect(ChamberInspector)
    renderer.step(latest)
    hud.step(latest, current !== null && nextLevelId(current) !== undefined)
    for (const cue of latest.cues) {
      sound.play(cue)
      if (cue.kind === "solved") onSolved()
    }
    return Result.success(undefined)
  },
  render: () => {
    const now = performance.now()
    const frames = Math.min(4, (now - lastDraw) / STEP_MS)
    lastDraw = now
    renderer.draw(frames)
  },
  onFailure: (failure) => console.error("Emberworks stopped", failure)
})
if (!loop.ok) throw new Error(`loop failed: ${JSON.stringify(loop.error)}`)

// While developing, scripts in a browser can read the view and send intents.
if (import.meta.env.DEV) {
  Object.assign(window, { emberworks: { view: () => latest, send } })
}

// Start where the player left off, or in the chamber the URL names.
const asked = new URL(window.location.href).searchParams.get("chamber")
if (asked !== null && unlocked(asked)) open(asked)
else showWorks()
