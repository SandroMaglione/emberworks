/**
 * Drives the page like a finger: taps, holds, undoes, and pulls the lever
 * wrong, and checks the view after each. Needs the dev server.
 *
 *   node scripts/interact.ts [baseUrl]
 */
import { chromium } from "playwright"

import { levelById } from "../src/sim/levels.ts"
import { layoutFor } from "../src/host/layout.ts"

const [base = "http://localhost:5260"] = process.argv.slice(2)
const viewport = { width: 390, height: 844 }
const browser = await chromium.launch()
const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true })
const errors: Array<string> = []
page.on("pageerror", (error) => errors.push(String(error)))

interface RelayView { cell: number; rotation: number; locked: boolean; scorched: boolean }
interface View { phase: { tag: string }; relays: Array<RelayView>; canUndo: boolean }
const view = (): Promise<View> => page.evaluate(() => (window as unknown as { emberworks: { view: () => View } }).emberworks.view())
const relay = async (cell: number): Promise<RelayView> => {
  const found = (await view()).relays.find((entry) => entry.cell === cell)
  if (found === undefined) throw new Error(`no relay at ${cell}`)
  return found
}

let failed = 0
const check = (name: string, ok: boolean): void => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`)
  if (!ok) failed++
}

const level = levelById("1-3")!
await page.goto(`${base}/?all&chamber=1-3`)
await page.waitForTimeout(400)
const layout = layoutFor(level, viewport.width, viewport.height)
const at = (cell: number) => ({ x: layout.originX + ((cell % level.width) + 0.5) * layout.cell, y: layout.originY + (Math.floor(cell / level.width) + 0.5) * layout.cell })

// A tap turns.
const before = (await relay(1)).rotation
await page.touchscreen.tap(at(1).x, at(1).y)
await page.waitForTimeout(120)
check("a touch tap turns the relay", (await relay(1)).rotation === (before + 1) % 4)
check("undo is offered after a turn", (await view()).canUndo)

// A hold locks; a tap then does nothing; a hold again unlocks.
const client = await page.context().newCDPSession(page)
const hold = async (x: number, y: number, ms: number) => {
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  await page.waitForTimeout(ms)
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
await hold(at(1).x, at(1).y, 600)
await page.waitForTimeout(120)
check("a hold locks the relay", (await relay(1)).locked)
const locked = (await relay(1)).rotation
await page.touchscreen.tap(at(1).x, at(1).y)
await page.waitForTimeout(120)
check("a locked relay does not turn", (await relay(1)).rotation === locked)
await hold(at(1).x, at(1).y, 600)
await page.waitForTimeout(120)
check("a hold again unlocks", !(await relay(1)).locked)

// The lamp does not turn.
await page.touchscreen.tap(at(0).x, at(0).y)
await page.waitForTimeout(120)
check("a lamp does not turn", (await relay(0)).rotation === 0)

// Undo and restart.
await page.keyboard.press("u")
await page.waitForTimeout(120)
check("undo puts the turn back", (await relay(1)).rotation === before)
await page.touchscreen.tap(at(1).x, at(1).y)
await page.touchscreen.tap(at(1).x, at(1).y)
await page.waitForTimeout(120)
await page.locator("button", { hasText: "Restart" }).tap()
await page.waitForTimeout(120)
check("restart returns to the start", (await relay(1)).rotation === before && !(await view()).canUndo)

// A wrong strike holds its faults until a tap, which only dismisses.
await page.locator(".lever").tap()
await page.waitForTimeout(100)
check("the lever starts the firing", (await view()).phase.tag === "Firing")
await page.waitForTimeout(1600)
check("the faults are held", (await view()).phase.tag === "Settling")
const held = (await relay(1)).rotation
await page.touchscreen.tap(at(1).x, at(1).y)
await page.waitForTimeout(120)
check("a tap dismisses without turning", (await view()).phase.tag === "Editing" && (await relay(1)).rotation === held)
check("a relay at fault is scorched", (await view()).relays.some((entry) => entry.scorched))
await page.touchscreen.tap(at(4).x, at(4).y)
await page.waitForTimeout(120)
check("turning a scorched relay clears its mark", !(await relay(4)).scorched)

// Back to the works and into the next chamber by the map.
await page.keyboard.press("Escape")
await page.waitForTimeout(200)
check("escape shows the works", await page.locator("#shell").isVisible())
await page.locator(".port", { hasText: /^2$/ }).tap()
await page.waitForTimeout(300)
check("a porthole opens its chamber", (await page.locator(".bar .title").textContent())?.includes("Pass It On") === true)

console.log(errors.length === 0 ? "no page errors" : errors.join("\n"))
await browser.close()
process.exit(failed === 0 && errors.length === 0 ? 0 : 1)
