/**
 * Makes chambers: builds a machine that fires right, scrambles its relays,
 * and keeps it when the solver finds exactly one answer. Prints each kept
 * chamber in the level format of `src/sim/levels.ts`, with measures of what
 * it asks of the player, so the author can curate.
 *
 *   node scripts/generate.ts --width 5 --height 5 --count 6 --seed 1 [--two 0.3] [--three 0] [--holes 0] [--embers 1] [--bolts 0] [--chain 0.5] [--min-depth 0] [--max-depth 1] [--tee 0.3]
 *
 * `chain` biases growth toward the relay that fired last (long chains and
 * fewer lamps) over any fired relay (bushy, many lamps). `two` and `three` are
 * the odds of adding a second or third striker into a relay. `bolts` is how
 * many relays are bolted as givens before uniqueness is forced by bolting.
 */
import { Random } from "@typeonce/ritmo"

import { armsOf, canonical, DIRS, fire, index, inBounds, ROTATIONS, SHAPES, type Dir, type Level, type Shape, type Tile } from "../src/sim/rules.ts"
import { decidedByPropagation, emberCoupling, forwardNecessity, solve, trace, trivialRatio } from "../src/sim/solver.ts"

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]
  const value = process.argv[i + 1]
  if (key !== undefined && value !== undefined) args.set(key.replace(/^--/, ""), value)
}
const num = (key: string, fallback: number): number => (args.has(key) ? Number(args.get(key)) : fallback)
const width = num("width", 5)
const height = num("height", 5)
const count = num("count", 5)
const seed = num("seed", 1)
const twoChance = num("two", 0.3)
const threeChance = num("three", 0)
const holes = num("holes", 0)
const embers = num("embers", 1)
const bolts = num("bolts", 0)
const chain = num("chain", 0.5)
const minDepth = num("min-depth", 0)
const maxDepth = num("max-depth", 1)
const teeChance = num("tee", 0.3)
const maxLamps = num("max-lamps", 0.4)
const maxTrivial = num("max-trivial", 1)
const minForward = num("min-forward", 0)
const minCoupling = num("min-coupling", 0)
const maxTurnable = num("max-turnable", 99)
/** The share of passes that decide at most one relay; a line of dominoes is near 1. */
const maxLinear = num("max-linear", 1)
/** Passes that decide two or more relays at once. */
const minWide = num("min-wide", 0)

const shapeOf = (dirs: ReadonlyArray<Dir>): { shape: Shape; rotation: number } | null => {
  const sorted = [...dirs].sort()
  for (const shape of Object.keys(SHAPES) as Array<Shape>) {
    for (const rotation of ROTATIONS[shape]) {
      const arms = [...armsOf(shape, rotation)].sort()
      if (arms.length === sorted.length && arms.every((dir, i) => dir === sorted[i])) return { shape, rotation }
    }
  }
  return null
}

const DX: Record<Dir, number> = { 0: 0, 1: 1, 2: 0, 3: -1 }
const DY: Record<Dir, number> = { 0: -1, 1: 0, 2: 1, 3: 0 }

interface Built {
  readonly level: Level
  readonly solution: ReadonlyArray<number>
}

const frame = { width, height } as Level

/** Builds one machine: the firing order over the cells, with arms from earlier cells to later ones. */
const build = (random: Random.Random, id: string): Built | null => {
  const total = width * height
  const open = new Set<number>()
  for (let i = 0; i < total; i++) open.add(i)
  let dug = 0
  let digTries = 0
  while (dug < holes && digTries < 100) {
    digTries++
    const at = Math.floor(random.next() * total)
    if (open.has(at) && open.size > 4) {
      open.delete(at)
      dug++
    }
  }
  const cells = [...open]
  const emberCells = random.shuffle(cells).slice(0, embers)
  // Grow from the embers: each new cell is struck by a fired cell.
  const order: Array<number> = [...emberCells]
  const edges = new Map<number, Set<Dir>>()
  const indeg = new Map<number, number>()
  for (const at of cells) {
    edges.set(at, new Set())
    indeg.set(at, 0)
  }
  const remaining = new Set(cells)
  for (const ember of emberCells) remaining.delete(ember)
  let stuck = 0
  while (remaining.size > 0 && stuck < 400) {
    // Long chains come from extending the latest relay; bushes from any.
    const from = random.next() < chain ? order[Math.max(0, order.length - 1 - Math.floor(random.next() * 2))] : order[Math.floor(random.next() * order.length)]
    if (from === undefined) break
    const dir = DIRS[Math.floor(random.next() * 4)]
    if (dir === undefined) break
    const x = (from % width) + DX[dir]
    const y = Math.floor(from / width) + DY[dir]
    if (!inBounds(frame, x, y)) {
      stuck++
      continue
    }
    const to = index({ width }, x, y)
    const arms = edges.get(from)
    if (arms === undefined || arms.has(to as never) || arms.has(dir) || !open.has(to)) {
      stuck++
      continue
    }
    if (arms.size >= 2 && random.next() > teeChance) {
      stuck++
      continue
    }
    if (remaining.has(to)) {
      arms.add(dir)
      indeg.set(to, 1)
      remaining.delete(to)
      order.push(to)
      stuck = 0
    } else if (!emberCells.includes(to) && order.indexOf(to) > order.indexOf(from)) {
      const has = indeg.get(to) ?? 0
      const chance = has === 1 ? twoChance : has === 2 ? threeChance : 0
      if (random.next() < chance) {
        arms.add(dir)
        indeg.set(to, has + 1)
      } else stuck++
    } else stuck++
  }
  if (remaining.size > 0) return null
  const tiles: Array<Tile | null> = []
  const solution: Array<number> = []
  for (let at = 0; at < total; at++) {
    if (!open.has(at)) {
      tiles.push(null)
      solution.push(0)
      continue
    }
    const made = shapeOf([...(edges.get(at) ?? [])])
    if (made === null) return null
    // An ember with no arms lights nothing.
    if (emberCells.includes(at) && made.shape === "o") return null
    const period = ROTATIONS[made.shape].length
    let start = made.rotation
    if (period > 1) start = canonical(made.shape, made.rotation + Math.floor(random.next() * (period - 1)) + 1)
    tiles.push({ shape: made.shape, pips: indeg.get(at) ?? 0, ember: emberCells.includes(at), bolted: false, start })
    solution.push(made.rotation)
  }
  const lamps = tiles.filter((tile) => tile !== null && tile.shape === "o").length
  if (lamps > maxLamps * cells.length) return null
  // Givens: bolt a few turnable relays at their solution.
  const turnable = tiles.map((tile, at) => (tile !== null && ROTATIONS[tile.shape].length > 1 ? at : -1)).filter((at) => at >= 0)
  for (const at of random.shuffle(turnable).slice(0, bolts)) {
    const tile = tiles[at]
    if (tile) tiles[at] = { ...tile, bolted: true, start: solution[at] ?? 0 }
  }
  const level: Level = { id, name: id, width, height, cells: tiles }
  if (!fire(level, solution).complete) return null
  return { level, solution }
}

/** Bolts relays that differ between two solutions until one remains. */
const makeUnique = (built: Built, random: Random.Random): Built | null => {
  let level = built.level
  for (let round = 0; round < 10; round++) {
    const result = solve(level, 2)
    if (result.solutions.length === 1) return { level, solution: built.solution }
    if (result.solutions.length === 0) return null
    const [a, b] = result.solutions
    if (a === undefined || b === undefined) return null
    const differing = a.rotations.map((r, at) => (r !== b.rotations[at] ? at : -1)).filter((at) => at >= 0)
    const pick = differing[Math.floor(random.next() * differing.length)]
    if (pick === undefined) return null
    const cells = level.cells.map((tile, at) => (at === pick && tile !== null ? { ...tile, bolted: true, start: built.solution[at] ?? 0 } : tile))
    level = { ...level, cells }
  }
  return null
}

const token = (tile: Tile | null): string => {
  if (tile === null) return ".."
  const flag = tile.ember ? "*" : tile.bolted ? "#" : ""
  const rotation = ROTATIONS[tile.shape].length > 1 ? String(tile.start) : ""
  return `${flag}${tile.shape}${tile.pips}${rotation}`
}

const random = Random.make(seed)
let made = 0
let tries = 0
while (made < count && tries < 4000) {
  tries++
  const built = build(random, `g${width}x${height}-${seed}-${tries}`)
  if (built === null) continue
  const unique = makeUnique(built, random)
  if (unique === null) continue
  const result = solve(unique.level, 2)
  if (result.depth < minDepth || result.depth > maxDepth) continue
  const relays = unique.level.cells.filter((t) => t !== null)
  const turnableCount = relays.filter((t) => !t.bolted && ROTATIONS[t.shape].length > 1).length
  if (turnableCount > maxTurnable) continue
  const trivial = trivialRatio(unique.level)
  if (trivial > maxTrivial) continue
  const forward = forwardNecessity(unique.level, unique.solution)
  if (forward.differing < minForward) continue
  const coupling = emberCoupling(unique.level, unique.solution)
  if (embers > 1 && coupling < minCoupling) continue
  const shape = trace(unique.level)
  const wide = shape.decided.filter((n) => n >= 2).length
  const linear = shape.decided.length === 0 ? 1 : shape.decided.filter((n) => n <= 1).length / shape.decided.length
  if (linear > maxLinear || wide < minWide) continue
  const bolted = relays.filter((t) => t.bolted).length
  const propagated = decidedByPropagation(unique.level)
  const twos = relays.filter((t) => t.pips === 2).length
  const threes = relays.filter((t) => t.pips === 3).length
  const lamps = relays.filter((t) => t.shape === "o").length
  const tees = relays.filter((t) => t.shape === "T" || t.shape === "x").length
  const waves = fire(unique.level, unique.solution).waves.length
  console.log(`// ${unique.level.id}: depth ${result.depth}, trivial ${(trivial * 100).toFixed(0)}% of ${turnableCount} turnable, forward-only decides ${forward.differing} relays (${forward.others} counting-only answers), coupling ${coupling}, sockets decide ${propagated}/${relays.length}, passes [${shape.decided.join(" ")}] stuck ${shape.stuck}, waves ${waves}, lamps ${lamps}, tees ${tees}, 2s ${twos}, 3s ${threes}, bolted ${bolted}`)
  for (let y = 0; y < height; y++) {
    const row: Array<string> = []
    for (let x = 0; x < width; x++) row.push(token(unique.level.cells[index({ width }, x, y)] ?? null))
    console.log(`"${row.join(" ")}",`)
  }
  made++
}
console.log(`// made ${made} in ${tries} tries`)
