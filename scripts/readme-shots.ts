/**
 * The README's screenshots, taken from the running game.
 *
 *   node scripts/readme-shots.ts [baseUrl]
 */
import { mkdir } from "node:fs/promises"
import { chromium, type Page } from "playwright"

import { layoutFor } from "../src/host/layout.ts"
import { levelById, LEVELS } from "../src/sim/levels.ts"
import { ROTATIONS, startRotations } from "../src/sim/rules.ts"
import { solve } from "../src/sim/solver.ts"

const [base = "http://localhost:5260"] = process.argv.slice(2)
// PNGs land in output/readme; convert them into docs/screenshots with `cwebp -q 86`.
const out = "output/readme"
/** Relays of chamber 2-5 turned once past their answer for the faults shot. */
const wrongCells = (process.env.WRONG ?? "6,12").split(",").map(Number)
await mkdir(out, { recursive: true })
const browser = await chromium.launch()

/** Taps the relays of a chamber into its answer. */
const solveIn = async (page: Page, id: string, width: number, height: number): Promise<void> => {
  const level = levelById(id)!
  const solution = solve(level, 1).solutions[0]!.rotations
  const layout = layoutFor(level, width, height)
  const start = startRotations(level)
  for (let cell = 0; cell < level.cells.length; cell++) {
    const tile = level.cells[cell]
    if (tile === null || tile === undefined || tile.bolted) continue
    let at = start[cell] ?? 0
    const x = layout.originX + ((cell % level.width) + 0.5) * layout.cell
    const y = layout.originY + (Math.floor(cell / level.width) + 0.5) * layout.cell
    while (at !== solution[cell]) {
      await page.mouse.click(x, y, { delay: 15 })
      await page.waitForTimeout(30)
      at = (at + 1) % ROTATIONS[tile.shape].length
    }
  }
  await page.waitForTimeout(500)
}

const desktop = async () => {
  const width = 1000
  const height = 820
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  // Some progress, so the works show lit portholes and a turning gear.
  await page.goto(`${base}/`)
  await page.evaluate((solved) => window.localStorage.setItem("emberworks.progress.v1", JSON.stringify({ solved })), LEVELS.slice(0, 9).map((level) => level.id))
  await page.goto(`${base}/`)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/works.png` })

  await page.goto(`${base}/?all&chamber=3-5`)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/chamber.png` })

  // A nearly right pull, held: two relays turned wrong show what each fault looks like.
  await page.goto(`${base}/?all&chamber=2-5`)
  await page.waitForTimeout(600)
  await solveIn(page, "2-5", width, height)
  for (const cell of wrongCells) {
    const level = levelById("2-5")!
    const layout = layoutFor(level, width, height)
    await page.mouse.click(layout.originX + ((cell % level.width) + 0.5) * layout.cell, layout.originY + (Math.floor(cell / level.width) + 0.5) * layout.cell)
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(400)
  await page.keyboard.press("Space")
  await page.waitForTimeout(4500)
  await page.screenshot({ path: `${out}/faults.png` })

  // The right answer, mid-cascade, then lit.
  await page.goto(`${base}/?all&chamber=4-4`)
  await page.waitForTimeout(600)
  await solveIn(page, "4-4", width, height)
  await page.keyboard.press("Space")
  await page.waitForTimeout(1150)
  await page.screenshot({ path: `${out}/cascade.png` })
  await page.waitForTimeout(7000)
  await page.screenshot({ path: `${out}/lit.png` })

  await page.close()
}

const phone = async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await page.goto(`${base}/?all&chamber=2-5`)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/phone.png` })
  await page.close()
}

await desktop()
await phone()
await browser.close()
console.log("done")
