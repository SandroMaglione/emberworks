import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { HostClock } from "@typeonce/ritmo"
import { Determinism } from "@typeonce/ritmo-devtools"

import { LEVELS, levelById, ROOMS } from "../src/sim/levels.ts"
import { armsAt, fire, solved, startRotations, type Level } from "../src/sim/rules.ts"
import { IntentEvent, type Intent } from "../src/sim/schema.ts"
import { createDebugSimulation, createSimulation } from "../src/sim/simulation.ts"
import { solve } from "../src/sim/solver.ts"
import { WAVE_TICKS } from "../src/sim/timing.ts"
import { ChamberInspector, type ChamberView } from "../src/sim/view.ts"

const sim = () => {
  const simulation = createSimulation()
  const send = (...intents: Array<Intent>): ChamberView => {
    for (const intent of intents) simulation.runtime.send(IntentEvent, intent)
    const ran = simulation.runtime.tick(simulation.update)
    assert.ok(ran.ok, `tick failed: ${JSON.stringify(ran.ok ? null : ran.error)}`)
    return simulation.runtime.inspect(ChamberInspector)
  }
  const ticks = (count: number): ChamberView => {
    let view = simulation.runtime.inspect(ChamberInspector)
    for (let i = 0; i < count; i++) view = send()
    return view
  }
  return { simulation, send, ticks }
}

const solutionOf = (level: Level) => {
  const result = solve(level, 2)
  assert.equal(result.solutions.length, 1, `${level.id} has ${result.solutions.length} solutions`)
  return result.solutions[0]!.rotations
}

/** The rotate intents that take a chamber from its start to its solution. */
const movesTo = (level: Level, rotations: ReadonlyArray<number>): Array<Intent> => {
  const moves: Array<Intent> = []
  const start = startRotations(level)
  level.cells.forEach((tile, cell) => {
    if (tile === null) return
    let at = start[cell] ?? 0
    const period = { o: 1, i: 4, I: 2, L: 4, T: 4, x: 1 }[tile.shape]
    while (at !== rotations[cell]) {
      moves.push({ kind: "rotate", cell })
      at = (at + 1) % period
    }
  })
  return moves
}

describe("content", () => {
  it("every chamber has exactly one answer, is not solved at the start, and balances its sockets with its arms", () => {
    const ids = new Set<string>()
    for (const level of LEVELS) {
      assert.ok(!ids.has(level.id), `duplicate id ${level.id}`)
      ids.add(level.id)
      const rotations = solutionOf(level)
      assert.ok(!solved(level, startRotations(level)), `${level.id} starts solved`)
      assert.ok(fire(level, rotations).complete)
      const arms = armsAt(level, rotations).length
      const sockets = level.cells.reduce((sum, tile) => sum + (tile?.pips ?? 0), 0)
      assert.equal(arms, sockets, `${level.id}: ${arms} arms for ${sockets} sockets`)
      assert.ok(level.cells.some((tile) => tile?.ember), `${level.id} has no ember`)
    }
  })

  it("rooms list every chamber once", () => {
    assert.equal(ROOMS.flatMap((room) => room.levels).length, LEVELS.length)
    assert.equal(LEVELS.length, 24)
  })
})

describe("play", () => {
  it("loads a chamber, turns relays, undoes, and restarts", () => {
    const { send } = sim()
    const level = levelById("1-1")!
    let view = send({ kind: "load", levelId: "1-1" })
    assert.equal(view.level?.id, "1-1")
    assert.equal(view.relays.length, level.cells.filter((tile) => tile !== null).length)
    assert.equal(view.phase.tag, "Editing")
    const start = view.relays[0]!.rotation
    view = send({ kind: "rotate", cell: 0 })
    assert.equal(view.relays[0]!.rotation, (start + 1) % 4)
    assert.ok(view.cues.some((cue) => cue.kind === "turn"))
    assert.equal(view.canUndo, true)
    view = send({ kind: "undo" })
    assert.equal(view.relays[0]!.rotation, start)
    assert.equal(view.canUndo, false)
    view = send({ kind: "rotate", cell: 0 }, { kind: "rotate", cell: 0 }, { kind: "restart" })
    assert.equal(view.relays[0]!.rotation, start)
    assert.equal(view.canUndo, false)
  })

  it("lamps, bolted relays and locked relays do not turn", () => {
    const { send } = sim()
    let view = send({ kind: "load", levelId: "1-3" })
    const lamp = view.relays.find((relay) => relay.shape === "o")!
    view = send({ kind: "rotate", cell: lamp.cell })
    assert.equal(view.canUndo, false)
    view = send({ kind: "lock", cell: 1 })
    assert.equal(view.relays.find((relay) => relay.cell === 1)!.locked, true)
    const before = view.relays.find((relay) => relay.cell === 1)!.rotation
    view = send({ kind: "rotate", cell: 1 })
    assert.equal(view.relays.find((relay) => relay.cell === 1)!.rotation, before)
    view = send({ kind: "lock", cell: 1 }, { kind: "rotate", cell: 1 })
    assert.notEqual(view.relays.find((relay) => relay.cell === 1)!.rotation, before)
  })

  it("a wrong strike plays its waves, shows its faults until dismissed, and scorches the relay at fault", () => {
    const { send, ticks } = sim()
    let view = send({ kind: "load", levelId: "1-1" })
    view = send({ kind: "strike" })
    assert.ok(view.cues.some((cue) => cue.kind === "strike"))
    view = ticks(1)
    assert.equal(view.phase.tag, "Firing")
    assert.ok(view.firing !== null && !view.firing.complete)
    const waves = view.firing!.waves.length
    view = ticks(WAVE_TICKS * (waves + 1))
    assert.equal(view.phase.tag, "Settling")
    view = ticks(30)
    assert.equal(view.phase.tag, "Settling", "faults are held until dismissed")
    // The first tap only dismisses.
    view = send({ kind: "rotate", cell: 0 })
    assert.equal(view.phase.tag, "Editing")
    assert.equal(view.canUndo, false)
    assert.ok(view.relays.some((relay) => relay.scorched), "the relay that wasted its spark is scorched")
    assert.ok(view.relays.every((relay) => relay.wave === null))
    view = send({ kind: "rotate", cell: 0 })
    assert.equal(view.relays.find((relay) => relay.cell === 0)!.scorched, false)
  })

  it("the right configuration lights every relay wave by wave and solves the chamber", () => {
    const { send, ticks } = sim()
    const level = levelById("1-3")!
    send({ kind: "load", levelId: level.id })
    let view = send(...movesTo(level, solutionOf(level)))
    assert.ok(view.firing === null)
    view = send({ kind: "strike" })
    const fired: Array<number> = []
    for (let i = 0; i < 400 && view.phase.tag !== "Solved"; i++) {
      view = ticks(1)
      if (view.phase.tag === "Firing") {
        const litNow = view.relays.filter((relay) => relay.wave !== null).length
        if (litNow > (fired.at(-1) ?? 0)) fired.push(litNow)
      }
    }
    assert.equal(view.phase.tag, "Solved")
    assert.ok(fired.length >= 2, "relays lit over several waves")
    assert.ok(view.relays.every((relay) => relay.wave !== null))
    assert.equal(view.strikes, 1)
    // Nothing turns once solved.
    const rotation = view.relays[1]!.rotation
    view = send({ kind: "rotate", cell: view.relays[1]!.cell })
    assert.equal(view.relays[1]!.rotation, rotation)
    // A new chamber loads over it.
    view = send({ kind: "load", levelId: "1-1" })
    assert.equal(view.level?.id, "1-1")
    assert.equal(view.phase.tag, "Editing")
    assert.equal(view.relays.length, 2)
  })

  it("skip ends the firing at once", () => {
    const { send, ticks } = sim()
    const level = levelById("1-2")!
    send({ kind: "load", levelId: level.id })
    send(...movesTo(level, solutionOf(level)))
    send({ kind: "strike" })
    let view = ticks(2)
    assert.equal(view.phase.tag, "Firing")
    view = send({ kind: "skip" })
    assert.equal(view.phase.tag, "Solved")
    assert.ok(view.relays.every((relay) => relay.wave !== null))
  })

  it("every chamber is solved by its solver solution and by nothing a single turn away", () => {
    for (const level of LEVELS) {
      const { send, ticks } = sim()
      send({ kind: "load", levelId: level.id })
      send(...movesTo(level, solutionOf(level)))
      send({ kind: "strike" })
      const view = ticks(WAVE_TICKS * 40)
      assert.equal(view.phase.tag, "Solved", level.id)
    }
  })

  it("replays the same from the same intents", () => {
    const script = (runtime: ReturnType<typeof createDebugSimulation>) => {
      const level = levelById("1-3")!
      runtime.runtime.send(IntentEvent, { kind: "load", levelId: level.id })
      assert.ok(runtime.runtime.tick(runtime.update).ok)
      for (const intent of movesTo(level, solutionOf(level))) runtime.runtime.send(IntentEvent, intent)
      runtime.runtime.send(IntentEvent, { kind: "strike" })
      for (let i = 0; i < 120; i++) assert.ok(runtime.runtime.tick(runtime.update).ok)
      return runtime.runtime.inspect(ChamberInspector)
    }
    const a = script(createDebugSimulation(HostClock.test()))
    const b = script(createDebugSimulation(HostClock.test()))
    assert.deepEqual(a, b)
    assert.ok(Determinism)
  })
})
