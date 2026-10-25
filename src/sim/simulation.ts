/**
 * The game without a browser: the schedule and a runtime that needs nothing
 * from the page. The page, tests, and `ritmo-devtools lint` all build it here.
 */
import type { HostClock } from "@typeonce/ritmo"
import type { Lint } from "@typeonce/ritmo-devtools"

import { Game, IntentEvent, Phase, type Root } from "./schema.ts"
import { AdvanceFiringSystem, AdvanceSettlingSystem, AdvanceSolvedSystem, ApplyIntentsSystem } from "./systems.ts"

/** One fixed step at 60 Hz: intents first, then the firing's pacing, then the queued changes apply. */
export const updateSchedule = Game.Schedule(
  ApplyIntentsSystem,
  AdvanceFiringSystem,
  AdvanceSettlingSystem,
  AdvanceSolvedSystem,
  Game.Schedule.applyStateTransitions()
)

export const initialResources = () => ({
  Chamber: { levelId: null, history: [], strikes: 0, clean: true },
  Cues: []
}) as const

const machines = () => Game.Runtime.machines(Game.Runtime.machine(Phase, { _tag: "Editing" }))

export const createSimulation = () => {
  const made = Game.Runtime.make({ services: Game.Runtime.services(), resources: initialResources(), machines: machines() })
  return { runtime: made.value, update: updateSchedule }
}

/** The same runtime with the debug handle, for devtools sessions and the lint. */
export const createDebugSimulation = (hostClock: HostClock.HostClock) => {
  const made = Game.Runtime.make({ services: Game.Runtime.services(), resources: initialResources(), machines: machines(), debug: { hostClock } })
  return { runtime: made.value, update: updateSchedule }
}

export const lintTarget = async (): Promise<Lint.Target<typeof Game.schema, typeof Root>> => {
  const { HostClock } = await import("@typeonce/ritmo")
  const simulation = createDebugSimulation(HostClock.test())
  // The host sends intents with `runtime.send`; no system emits them.
  return { runtime: simulation.runtime, schedules: { update: simulation.update }, hostEvents: [IntentEvent] }
}
