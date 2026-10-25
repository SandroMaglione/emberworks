/**
 * Plays every chamber in a real browser: taps the relays into the solver's
 * answer, pulls the lever, and checks the chamber lights and progress saves.
 *
 *   node scripts/autoplay.ts [baseUrl] [onlyLevelId]
 */
import { chromium } from "playwright"

import { LEVELS } from "../src/sim/levels.ts"
import { ROTATIONS, startRotations } from "../src/sim/rules.ts"
import { solve } from "../src/sim/solver.ts"
import { layoutFor } from "../src/host/layout.ts"

const [base = "http://localhost:5260", only] = process.argv.slice(2)
const viewport = { width: 820, height: 760 }
const browser = await chromium.launch()
const page = await browser.newPage({ viewport })
const errors: Array<string> = []
page.on("pageerror", (error) => errors.push(String(error)))

let failures = 0
for (const level of LEVELS) {
  if (only !== undefined && level.id !== only) continue
  const solution = solve(level, 1).solutions[0]?.rotations
  if (solution === undefined) throw new Error(`${level.id} has no solution`)
  await page.goto(`${base}/?all&chamber=${level.id}`)
  // Wait for the chamber to be on screen: over the network the page takes longer than locally.
  await page.locator(".bar .title", { hasText: level.name }).waitFor()
  await page.waitForTimeout(400)
  const layout = layoutFor(level, viewport.width, viewport.height)
  const start = startRotations(level)
  let taps = 0
  for (let cell = 0; cell < level.cells.length; cell++) {
    const tile = level.cells[cell]
    if (tile === null || tile === undefined || tile.bolted) continue
    const period = ROTATIONS[tile.shape].length
    let at = start[cell] ?? 0
    const x = layout.originX + ((cell % level.width) + 0.5) * layout.cell
    const y = layout.originY + (Math.floor(cell / level.width) + 0.5) * layout.cell
    while (at !== solution[cell]) {
      await page.mouse.click(x, y, { delay: 20 })
      await page.waitForTimeout(40)
      at = (at + 1) % period
      taps++
    }
  }
  await page.waitForTimeout(120)
  await page.keyboard.press("Space")
  await page.waitForTimeout(200)
  // Skip the cascade on the second press.
  await page.keyboard.press("Space")
  await page.waitForTimeout(250)
  if (only !== undefined) {
    await page.waitForTimeout(900)
    await page.screenshot({ path: `output/shots/${level.id}-solved.png` })
  }
  const lever = await page.locator(".lever").textContent()
  const saved = await page.evaluate(() => window.localStorage.getItem("emberworks.progress.v1"))
  const lit = lever?.includes("Next") || lever?.includes("Back to the works")
  const stored = saved?.includes(`"${level.id}"`) ?? false
  if (!lit || !stored) failures++
  console.log(`${level.id} ${level.name}: ${taps} taps, lever "${lever}", saved ${stored}`)
}
console.log(errors.length === 0 ? "no page errors" : errors.join("\n"))
console.log(failures === 0 ? "every chamber lit" : `${failures} chambers did not light`)
await browser.close()
process.exit(failures === 0 && errors.length === 0 ? 0 : 1)
