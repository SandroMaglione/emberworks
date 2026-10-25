/**
 * Screenshots of the game for a look at it without a browser window:
 * the works, a chamber, and a strike.
 *
 *   node scripts/shots.ts [baseUrl] [chamber]
 */
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

const [base = "http://localhost:5260", chamber = "1-1", size = "900x760"] = process.argv.slice(2)
const [vw = "900", vh = "760"] = size.split("x")
await mkdir("output/shots", { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(vw), height: Number(vh) }, deviceScaleFactor: 1, hasTouch: Number(vw) < 600 })
const errors: Array<string> = []
page.on("pageerror", (error) => errors.push(String(error)))
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
await page.goto(`${base}/`)
await page.waitForTimeout(600)
await page.screenshot({ path: `output/shots/works-${size}.png` })
await page.goto(`${base}/?all&chamber=${chamber}`)
await page.waitForTimeout(700)
await page.screenshot({ path: `output/shots/${chamber}-start-${size}.png` })
await page.keyboard.press("Space")
await page.waitForTimeout(260)
await page.screenshot({ path: `output/shots/${chamber}-firing-${size}.png` })
await page.waitForTimeout(1400)
await page.screenshot({ path: `output/shots/${chamber}-after-${size}.png` })
console.log(errors.length === 0 ? "no page errors" : errors.join("\n"))
await browser.close()
