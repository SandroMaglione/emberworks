/** The curation measures of every chamber in the game, to compare rooms. */
import { LEVELS } from "../src/sim/levels.ts"
import { fire, ROTATIONS } from "../src/sim/rules.ts"
import { emberCoupling, forwardNecessity, solve, trace, trivialRatio } from "../src/sim/solver.ts"

for (const level of LEVELS) {
  const result = solve(level, 2)
  const solution = result.solutions[0]?.rotations ?? []
  const relays = level.cells.filter((t) => t !== null)
  const turnable = relays.filter((t) => !t.bolted && ROTATIONS[t.shape].length > 1).length
  const forward = forwardNecessity(level, solution)
  const multi = relays.filter((t) => t.pips >= 2 && t.shape !== "o").length
  const shape = trace(level)
  console.log(`${level.id.padEnd(4)} ${level.name.padEnd(18)} ${level.width}x${level.height} turnable ${String(turnable).padStart(2)} depth ${result.depth} trivial ${(trivialRatio(level) * 100).toFixed(0).padStart(3)}% forward ${forward.differing} (${forward.others}) coupling ${emberCoupling(level, solution)} multi ${multi} waves ${fire(level, solution).waves.length} passes [${shape.decided.join(" ")}] stuck ${shape.stuck}`)
}
