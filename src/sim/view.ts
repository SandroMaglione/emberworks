/**
 * The projection: the one place the world is read into plain view data for
 * the renderer, the HUD, and the sound.
 */
import { levelById } from "./levels.ts"
import { fire, type Firing, type Level, type Shape } from "./rules.ts"
import { Chamber, Cues, Game, Glow, Mark, Phase, Relay, Turn, type Cue } from "./schema.ts"

export interface RelayView {
  readonly cell: number
  readonly x: number
  readonly y: number
  readonly shape: Shape
  readonly pips: number
  readonly ember: boolean
  readonly bolted: boolean
  readonly rotation: number
  readonly locked: boolean
  /** The wave this relay fired in, or `null` while dark. */
  readonly wave: number | null
  readonly shorted: boolean
  readonly scorched: boolean
}

export type PhaseView =
  | { readonly tag: "Editing" }
  | { readonly tag: "Firing"; readonly wave: number; readonly step: number }
  | { readonly tag: "Settling"; readonly step: number }
  | { readonly tag: "Solved"; readonly step: number }

export interface ChamberView {
  readonly level: Level | null
  readonly phase: PhaseView
  readonly relays: ReadonlyArray<RelayView>
  /** The firing being shown, while the lever is down or its result is held. */
  readonly firing: Firing | null
  readonly canUndo: boolean
  readonly strikes: number
  readonly cues: ReadonlyArray<Cue>
}

const RelayQuery = Game.Query({
  selection: {
    relay: Game.Query.read(Relay),
    turn: Game.Query.read(Turn),
    mark: Game.Query.read(Mark),
    glow: Game.Query.read(Glow)
  }
})

export const ChamberInspector = Game.Inspector(
  "Emberworks/ChamberView",
  {
    queries: { relays: RelayQuery },
    resources: { chamber: Game.System.readResource(Chamber), cues: Game.System.readResource(Cues) },
    machines: { phase: Game.System.machine(Phase) }
  },
  ({ queries, resources, machines }): ChamberView => {
    const chamber = resources.chamber.get()
    const level = chamber.levelId === null ? null : (levelById(chamber.levelId) ?? null)
    const relays: Array<RelayView> = queries.relays.each().map(({ data }) => {
      const relay = data.relay.get()
      const glow = data.glow.get()
      return { ...relay, rotation: data.turn.get().rotation, locked: data.mark.get().locked, wave: glow.wave, shorted: glow.shorted, scorched: glow.scorched }
    })
    relays.sort((a, b) => a.cell - b.cell)
    const value = machines.phase.get()
    const phase: PhaseView =
      value._tag === "Firing" ? { tag: "Firing", wave: value.wave, step: value.step }
      : value._tag === "Settling" ? { tag: "Settling", step: value.step }
      : value._tag === "Solved" ? { tag: "Solved", step: value.step }
      : { tag: "Editing" }
    let firing: Firing | null = null
    if (level !== null && phase.tag !== "Editing") {
      const rotations = level.cells.map(() => 0)
      for (const relay of relays) rotations[relay.cell] = relay.rotation
      firing = fire(level, rotations)
    }
    return { level, phase, relays, firing, canUndo: chamber.history.length > 0, strikes: chamber.strikes, cues: resources.cues.get() }
  }
)
