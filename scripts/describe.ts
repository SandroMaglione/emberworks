/**
 * Prints a chamber as a player sees it at the start (no solution), for a
 * reasoning playtest by a reader without the game. Each cell shows its kind,
 * its sockets, and where its strikers point right now.
 *
 *   node scripts/describe.ts <levelId> [...more]
 */
import { levelById } from "../src/sim/levels.ts"
import { armsOf, index } from "../src/sim/rules.ts"

const NAMES = ["N", "E", "S", "W"]
for (const id of process.argv.slice(2)) {
  const level = levelById(id)
  if (level === undefined) continue
  console.log(`## Chamber ${id} "${level.name}" (${level.width} wide, ${level.height} tall; columns A.., rows 1..)`)
  for (let y = 0; y < level.height; y++) {
    const cells: Array<string> = []
    for (let x = 0; x < level.width; x++) {
      const tile = level.cells[index(level, x, y)]
      const name = `${String.fromCharCode(65 + x)}${y + 1}`
      if (tile === null || tile === undefined) {
        cells.push(`${name}: hole`)
        continue
      }
      const arms = armsOf(tile.shape, tile.start).map((d) => NAMES[d]).join("")
      const kind = tile.ember ? "EMBER" : tile.shape === "o" ? "lamp" : "relay"
      const fixed = tile.bolted || tile.shape === "x" || tile.shape === "o" ? " (fixed)" : ""
      cells.push(`${name}: ${kind}${fixed}, ${tile.pips} socket${tile.pips === 1 ? "" : "s"}, ${arms === "" ? "no arms" : `arms now ${arms}`}`)
    }
    console.log(cells.join(" | "))
  }
  console.log("")
}
