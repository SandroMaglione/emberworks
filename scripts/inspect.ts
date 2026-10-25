/** Prints each chamber with its solution and the solver's measures. */
import { LEVELS } from "../src/sim/levels.ts"
import { armsOf, index } from "../src/sim/rules.ts"
import { decidedByPropagation, solve } from "../src/sim/solver.ts"

const ARROWS = ["^", ">", "v", "<"]
for (const level of LEVELS) {
  const result = solve(level, 3)
  const solution = result.solutions[0]?.rotations
  console.log(`${level.id} ${level.name}: ${result.solutions.length} solution(s), depth ${result.depth}, guesses ${result.guesses}, propagation decides ${decidedByPropagation(level)}`)
  for (let y = 0; y < level.height; y++) {
    let row = ""
    for (let x = 0; x < level.width; x++) {
      const at = index(level, x, y)
      const tile = level.cells[at]
      if (tile === null || tile === undefined) {
        row += "  ....  "
        continue
      }
      const arms = solution === undefined ? "?" : armsOf(tile.shape, solution[at] ?? 0).map((d) => ARROWS[d]).join("")
      row += ` ${tile.ember ? "*" : tile.bolted ? "#" : " "}${tile.shape}${tile.pips}${arms.padEnd(4)}`
    }
    console.log(row)
  }
}
