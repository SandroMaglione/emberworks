/**
 * The systems: one applies the player's intents, the others pace the firing.
 */
import { levelById } from "./levels.ts"
import { canonical, fire, ROTATIONS, type Firing, type Level } from "./rules.ts"
import { Chamber, Cues, firing, Game, Glow, IntentEvent, Mark, Phase, Relay, settling, solvedState, Turn, type Cue, type Intent, type RelayValue } from "./schema.ts"
import { WAVE_TICKS } from "./timing.ts"

const RelayQuery = Game.Query({
  selection: {
    relay: Game.Query.read(Relay),
    turn: Game.Query.write(Turn),
    mark: Game.Query.write(Mark),
    glow: Game.Query.write(Glow)
  }
})

interface Cell<T> {
  get(): T
  set(value: T): void
}

/** The matched relays as the pure rules see them: rotations by cell. */
interface Matched {
  readonly relay: { get(): RelayValue }
  readonly turn: Cell<{ readonly rotation: number }>
  readonly mark: Cell<{ readonly locked: boolean }>
  readonly glow: Cell<{ readonly wave: number | null; readonly shorted: boolean; readonly scorched: boolean }>
}

const rotationsOf = (level: Level, matches: ReadonlyArray<Matched>): Array<number> => {
  const rotations = level.cells.map(() => 0)
  for (const match of matches) rotations[match.relay.get().cell] = match.turn.get().rotation
  return rotations
}

const DARK = { wave: null, shorted: false, scorched: false } as const

/** Lights the relays of the waves up to and including `upTo`, and marks what was shorted. */
const light = (result: Firing, matches: ReadonlyArray<Matched>, upTo: number): void => {
  const waveOf = new Map<number, number>()
  const shorted = new Set<number>()
  result.waves.forEach((wave, index) => {
    if (index > upTo) return
    for (const cell of wave.fired) waveOf.set(cell, index)
    for (const spark of wave.sparks) if (spark.outcome === "short") shorted.add(spark.arm.to)
  })
  for (const match of matches) {
    const cell = match.relay.get().cell
    const wave = waveOf.get(cell)
    const current = match.glow.get()
    const next = { wave: wave === undefined ? null : wave, shorted: shorted.has(cell), scorched: current.scorched }
    if (current.wave !== next.wave || current.shorted !== next.shorted) match.glow.set(next)
  }
}

const relayEntries = (level: Level) => {
  const entries: Array<readonly [RelayValue, number]> = []
  level.cells.forEach((tile, cell) => {
    if (tile === null) return
    entries.push([
      { cell, x: cell % level.width, y: Math.floor(cell / level.width), shape: tile.shape, pips: tile.pips, ember: tile.ember, bolted: tile.bolted },
      tile.start
    ])
  })
  return entries
}

export const ApplyIntentsSystem = Game.System(
  "Emberworks/ApplyIntents",
  {
    queries: { relays: RelayQuery },
    resources: { chamber: Game.System.writeResource(Chamber), cues: Game.System.writeResource(Cues) },
    events: { intents: Game.System.readEvent(IntentEvent) },
    machines: { phase: Game.System.machine(Phase) },
    nextMachines: { phase: Game.System.nextState(Phase) },
    commands: Game.System.commands(Game.System.spawns(Relay, Turn, Mark, Glow), Game.System.despawns(Relay))
  },
  ({ queries, resources, events, machines, nextMachines, commands }) => {
    const cues: Array<Cue> = []
    const matches = queries.relays.each().map((match) => match.data)
    const chamber = resources.chamber.get()
    const level = chamber.levelId === null ? undefined : levelById(chamber.levelId)
    const find = (cell: number): Matched | undefined => matches.find((match) => match.relay.get().cell === cell)
    // A load replaces the chamber; once loaded, later intents of the same tick are for the old one and are dropped.
    let loaded = false
    // The phase as this tick sees it: a queued change applies at the end of the tick.
    let phase = machines.phase.get()._tag

    const apply = (intent: Intent): void => {
      if (loaded) return
      if (intent.kind === "load") {
        const next = levelById(intent.levelId)
        if (next === undefined) return
        for (const match of queries.relays.each()) commands.despawn(match.entity)
        for (const [value, rotation] of relayEntries(next)) {
          commands.spawn(Game.Command.spawn(
            Game.Command.entry(Relay, value),
            Game.Command.entry(Turn, { rotation }),
            Game.Command.entry(Mark, { locked: false }),
            Game.Command.entry(Glow, DARK)
          ))
        }
        resources.chamber.set({ levelId: next.id, history: [], strikes: 0, clean: true })
        nextMachines.phase.set({ _tag: "Editing" })
        cues.push({ kind: "loaded" })
        loaded = true
        return
      }
      if (level === undefined) return
      if (phase === "Settling") {
        // Any intent dismisses the shown faults; the first one is spent on that.
        // What went wrong leaves a scorch mark on the relay at fault until it is turned.
        const result = fire(level, rotationsOf(level, matches))
        const atFault = new Set<number>()
        for (const wave of result.waves) {
          for (const spark of wave.sparks) {
            if (spark.outcome === "wasted") atFault.add(spark.arm.from)
            if (spark.outcome === "short") atFault.add(spark.arm.to)
          }
        }
        for (const cell of result.starved) atFault.add(cell)
        for (const match of matches) match.glow.set({ ...DARK, scorched: atFault.has(match.relay.get().cell) })
        nextMachines.phase.set({ _tag: "Editing" })
        phase = "Editing"
        return
      }
      if (phase === "Firing") {
        if (intent.kind === "skip") {
          const result = fire(level, rotationsOf(level, matches))
          light(result, matches, result.waves.length)
          finish(result)
        }
        return
      }
      if (phase === "Solved") return
      switch (intent.kind) {
        case "rotate": {
          const match = find(intent.cell)
          if (match === undefined) return
          const relay = match.relay.get()
          if (relay.bolted || ROTATIONS[relay.shape].length < 2 || match.mark.get().locked) return
          const before = match.turn.get().rotation
          match.turn.set({ rotation: canonical(relay.shape, before + (intent.by ?? 1)) })
          if (match.glow.get().scorched) match.glow.set(DARK)
          resources.chamber.update((value) => ({ ...value, history: [...value.history, { cell: relay.cell, before }] }))
          cues.push({ kind: "turn", cell: relay.cell })
          return
        }
        case "lock": {
          const match = find(intent.cell)
          if (match === undefined) return
          const relay = match.relay.get()
          if (relay.bolted || ROTATIONS[relay.shape].length < 2) return
          const locked = !match.mark.get().locked
          match.mark.set({ locked })
          cues.push({ kind: "lock", cell: relay.cell, locked })
          return
        }
        case "undo": {
          const last = resources.chamber.get().history.at(-1)
          if (last === undefined) return
          const match = find(last.cell)
          if (match !== undefined) match.turn.set({ rotation: last.before })
          resources.chamber.update((value) => ({ ...value, history: value.history.slice(0, -1) }))
          cues.push({ kind: "undo" })
          return
        }
        case "restart": {
          for (const match of matches) {
            const tile = level.cells[match.relay.get().cell]
            if (tile === null || tile === undefined) continue
            if (match.turn.get().rotation !== tile.start) match.turn.set({ rotation: tile.start })
            if (match.mark.get().locked) match.mark.set({ locked: false })
            if (match.glow.get().scorched) match.glow.set(DARK)
          }
          resources.chamber.update((value) => ({ ...value, history: [] }))
          cues.push({ kind: "restart" })
          return
        }
        case "strike": {
          for (const match of matches) match.glow.set(DARK)
          resources.chamber.update((value) => ({ ...value, strikes: value.strikes + 1 }))
          nextMachines.phase.set({ _tag: "Firing", wave: 0, step: 0 })
          phase = "Firing"
          cues.push({ kind: "strike" })
          return
        }
        case "skip":
          return
      }
    }

    const finish = (result: Firing): void => {
      if (result.complete) {
        nextMachines.phase.set({ _tag: "Solved", step: 0 })
        cues.push({ kind: "solved", clean: resources.chamber.get().clean })
      } else {
        resources.chamber.update((value) => ({ ...value, clean: false }))
        nextMachines.phase.set({ _tag: "Settling", step: 0 })
        cues.push({ kind: "failed" })
      }
      phase = result.complete ? "Solved" : "Settling"
    }

    for (const intent of events.intents.all()) apply(intent)
    resources.cues.set(cues)
  }
)

/** Paces the waves while the lever is down. */
export const AdvanceFiringSystem = Game.System(
  "Emberworks/AdvanceFiring",
  {
    queries: { relays: RelayQuery },
    resources: { chamber: Game.System.writeResource(Chamber), cues: Game.System.writeResource(Cues) },
    machines: { phase: Game.System.updateMachine(Phase) },
    nextMachines: { phase: Game.System.nextState(Phase) },
    when: [firing]
  },
  ({ queries, resources, machines, nextMachines }) => {
    const value = machines.phase.get()
    if (value._tag !== "Firing") return
    const chamber = resources.chamber.get()
    const level = chamber.levelId === null ? undefined : levelById(chamber.levelId)
    if (level === undefined) return
    // A skip this tick already queued the end of the firing.
    if (nextMachines.phase.getPending() !== undefined) return
    const matches = queries.relays.each().map((match) => match.data)
    const result = fire(level, rotationsOf(level, matches))
    const cues = [...resources.cues.get()]
    if (value.step === 0) {
      const wave = result.waves[value.wave]
      if (wave === undefined) {
        // The last wave has shown for a beat: the firing is over.
        if (result.complete) {
          nextMachines.phase.set({ _tag: "Solved", step: 0 })
          cues.push({ kind: "solved", clean: chamber.clean })
        } else {
          resources.chamber.set({ ...chamber, clean: false })
          nextMachines.phase.set({ _tag: "Settling", step: 0 })
          cues.push({ kind: "failed" })
        }
        resources.cues.set(cues)
        return
      }
      light(result, matches, value.wave)
      cues.push({
        kind: "fire",
        wave: value.wave,
        count: wave.fired.length,
        wasted: wave.sparks.filter((spark) => spark.outcome === "wasted").length,
        shorted: wave.sparks.filter((spark) => spark.outcome === "short").length
      })
      resources.cues.set(cues)
    }
    const step = value.step + 1
    const advanced = machines.phase.update({
      state: "Firing",
      data: () => (step >= WAVE_TICKS ? { wave: value.wave + 1, step: 0 } : { wave: value.wave, step })
    })
    if (!advanced.ok) return
  }
)

/** Counts the ticks the faults have been shown, for the host's animation. */
export const AdvanceSettlingSystem = Game.System(
  "Emberworks/AdvanceSettling",
  { machines: { phase: Game.System.updateMachine(Phase) }, when: [settling] },
  ({ machines }) => {
    const advanced = machines.phase.update({ state: "Settling", data: (value) => ({ step: value.step + 1 }) })
    if (!advanced.ok) return
  }
)

/** Counts the ticks since the chamber was solved, for the host's celebration. */
export const AdvanceSolvedSystem = Game.System(
  "Emberworks/AdvanceSolved",
  { machines: { phase: Game.System.updateMachine(Phase) }, when: [solvedState] },
  ({ machines }) => {
    const advanced = machines.phase.update({ state: "Solved", data: (value) => ({ step: value.step + 1 }) })
    if (!advanced.ok) return
  }
)
