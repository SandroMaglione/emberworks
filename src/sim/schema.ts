/**
 * What the world may hold: one chamber at a time. Relays are entities; the
 * chamber's bookkeeping and the phase of play are world state.
 */
import { Descriptor, Schema } from "@typeonce/ritmo"

import type { Shape } from "./rules.ts"
import { counts } from "./standard.ts"

export const Root = Schema.defineRoot("Emberworks")

/** What a relay is: its place and its make. Replaced, never edited. */
export interface RelayValue {
  readonly cell: number
  readonly x: number
  readonly y: number
  readonly shape: Shape
  readonly pips: number
  readonly ember: boolean
  readonly bolted: boolean
}

export const Relay = Descriptor.Component<RelayValue>()("Emberworks/Relay", { immutable: true })
/** The relay's rotation, in quarter turns clockwise, always canonical for its shape. */
export const Turn = Descriptor.Component<{ rotation: number }>()("Emberworks/Turn")
/** The player's pencil mark: a locked relay does not turn on a tap. */
export const Mark = Descriptor.Component<{ locked: boolean }>()("Emberworks/Mark")
/**
 * How the relay looks right now: dark, or fired in a wave of the current
 * firing (`wave` is which), whether a spark shorted it, and whether a failed
 * strike left a scorch mark on it (cleared when it is turned).
 */
export const Glow = Descriptor.Component<{ wave: number | null; shorted: boolean; scorched: boolean }>()("Emberworks/Glow")

/** One turn the player made, for undo. */
export interface Move {
  readonly cell: number
  readonly before: number
}

export interface ChamberValue {
  /** The level loaded, or `null` before the first load. */
  readonly levelId: string | null
  readonly history: ReadonlyArray<Move>
  /** Levers pulled on this chamber since it was loaded or restarted. */
  readonly strikes: number
  /** No strike has failed yet: solving now is a clean strike. */
  readonly clean: boolean
}

export const Chamber = Descriptor.Resource<ChamberValue>()("Emberworks/Chamber")

/** Something the host should show or play this tick. Cleared every tick. */
export type Cue =
  | { readonly kind: "turn"; readonly cell: number }
  | { readonly kind: "lock"; readonly cell: number; readonly locked: boolean }
  | { readonly kind: "undo" }
  | { readonly kind: "restart" }
  | { readonly kind: "strike" }
  /** A wave fired: how many relays, and the wave's index for the rising pitch. */
  | { readonly kind: "fire"; readonly wave: number; readonly count: number; readonly wasted: number; readonly shorted: number }
  | { readonly kind: "solved"; readonly clean: boolean }
  | { readonly kind: "failed" }
  | { readonly kind: "loaded" }

export const Cues = Descriptor.TransientResource<ReadonlyArray<Cue>>()("Emberworks/Cues")

/** What the player asks for. The host sends these; so do tests. */
export type Intent =
  | { readonly kind: "load"; readonly levelId: string }
  | { readonly kind: "rotate"; readonly cell: number; readonly by?: 1 | -1 }
  | { readonly kind: "lock"; readonly cell: number }
  | { readonly kind: "undo" }
  | { readonly kind: "restart" }
  | { readonly kind: "strike" }
  /** Skip to the end of the firing. */
  | { readonly kind: "skip" }

export const IntentEvent = Descriptor.Event<Intent>()("Emberworks/Intent")

export const Game = Schema.bind(
  Schema.fragment({
    components: { Relay, Turn, Mark, Glow },
    requires: [Schema.requires(Relay, Turn, Mark, Glow)],
    resources: { Chamber, Cues },
    events: { IntentEvent }
  }),
  Root
)

/**
 * The phase of play. Editing: the player turns relays. Firing: the lever is
 * down and the waves play out, `wave` being the one lighting now and `step`
 * the ticks into it. Settling: the firing failed and its faults stay shown
 * for a moment. Solved: the chamber is lit for good.
 */
export const Phase = Game.StateMachine("Emberworks/Phase", {
  Editing: {},
  Firing: counts("wave", "step"),
  Settling: counts("step"),
  Solved: counts("step")
})

export const editing = Game.Condition.inState(Phase, "Editing")
export const firing = Game.Condition.inState(Phase, "Firing")
export const settling = Game.Condition.inState(Phase, "Settling")
export const solvedState = Game.Condition.inState(Phase, "Solved")
