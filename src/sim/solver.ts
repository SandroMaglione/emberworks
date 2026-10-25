/**
 * Solves a chamber the way a player reasons, to check that every level has
 * exactly one answer and to measure how hard it is to find.
 *
 * Each turnable relay has a domain of rotations. Propagation removes
 * rotations that waste a spark, and uses the pips: when the arms certainly
 * pointing at a relay already match its pips, no other arm may point at it,
 * and when the arms that could point at it are only just enough, they all
 * must. When propagation stalls, the solver guesses on the smallest domain;
 * the depth of guessing is the level's difficulty. The firing itself (no
 * dark islands) is checked on each complete assignment.
 */
import { armsOf, canonical, fire, ROTATIONS, target, type Dir, type Level, type Rotations } from "./rules.ts"

type Domains = Array<ReadonlyArray<number>>

/** For each cell, the arms it could receive: from which cell, under which rotations. */
interface Feeder {
  readonly from: number
  /** The rotations of `from` whose arm points at the cell. */
  readonly rotations: ReadonlyArray<number>
}

const feedersOf = (level: Level): ReadonlyArray<ReadonlyArray<Feeder>> => {
  const feeders: Array<Array<Feeder>> = level.cells.map(() => [])
  level.cells.forEach((tile, from) => {
    if (tile === null) return
    const byTarget = new Map<number, Array<number>>()
    for (const rotation of ROTATIONS[tile.shape]) {
      for (const dir of armsOf(tile.shape, rotation)) {
        const to = target(level, from, dir)
        if (to < 0) continue
        const list = byTarget.get(to) ?? []
        if (!list.includes(rotation)) list.push(rotation)
        byTarget.set(to, list)
      }
    }
    for (const [to, rotations] of byTarget) feeders[to]?.push({ from, rotations })
  })
  return feeders
}

const initialDomains = (level: Level): Domains =>
  level.cells.map((tile, at) => {
    if (tile === null) return [0]
    if (tile.bolted) return [canonical(tile.shape, tile.start)]
    // A rotation that aims an arm off the board or into a hole wastes a spark.
    return ROTATIONS[tile.shape].filter((rotation) => armsOf(tile.shape, rotation).every((dir: Dir) => target(level, at, dir) >= 0))
  })

/**
 * The forward-only rule as a player uses it: a relay that certainly feeds
 * another, directly or down a chain of certain arms, fires before it, so the
 * fed relay can never aim back at it. Removes those rotations; returns
 * whether anything changed.
 */
const forwardOnly = (level: Level, domains: Domains, reading: Domains = domains): boolean => {
  // Certain arms: the targets every rotation left in the domain strikes.
  const certain: Array<Array<number>> = level.cells.map(() => [])
  level.cells.forEach((tile, at) => {
    const domain = reading[at] ?? []
    if (tile === null || domain.length === 0) return
    const first = domain[0] ?? 0
    for (const dir of armsOf(tile.shape, first)) {
      const to = target(level, at, dir)
      if (to >= 0 && domain.every((rotation) => armsOf(tile.shape, rotation).includes(dir))) certain[at]?.push(to)
    }
  })
  // Ancestors of each relay along certain arms.
  const ancestors: Array<Set<number>> = level.cells.map(() => new Set())
  level.cells.forEach((tile, from) => {
    if (tile === null) return
    const stack = [...(certain[from] ?? [])]
    const seen = new Set<number>()
    while (stack.length > 0) {
      const to = stack.pop()
      if (to === undefined || seen.has(to)) continue
      seen.add(to)
      ancestors[to]?.add(from)
      for (const next of certain[to] ?? []) stack.push(next)
    }
  })
  let changed = false
  level.cells.forEach((tile, at) => {
    const domain = reading[at] ?? []
    const above = ancestors[at]
    if (tile === null || above === undefined || above.size === 0 || domain.length < 2) return
    const kept = domain.filter((rotation) => armsOf(tile.shape, rotation).every((dir) => !above.has(target(level, at, dir))))
    if (kept.length !== domain.length) {
      domains[at] = (domains[at] ?? []).filter((rotation) => kept.includes(rotation))
      changed = true
    }
  })
  return changed
}

/** Which rules a pass applies: the sockets alone, or the sockets and the forward-only rule. */
type Rules = "sockets" | "all"

/**
 * One pass of every rule over every cell: the sockets, then the forward-only
 * rule. Returns `false` on a contradiction, otherwise whether anything changed.
 */
const pass = (level: Level, feeders: ReadonlyArray<ReadonlyArray<Feeder>>, domains: Domains, rules: Rules, rounds = false): boolean | "contradiction" => {
  let changed = false
  // In rounds, every deduction reads the domains as they were when the round began, like a player
  // looking at the board once; otherwise deductions chain within the pass.
  const reading: Domains = rounds ? domains.map((domain) => domain) : domains
  const narrow = (at: number, kept: ReadonlyArray<number>): void => {
    const current = domains[at] ?? []
    const next = current.filter((rotation) => kept.includes(rotation))
    if (next.length !== current.length) {
      domains[at] = next
      changed = true
    }
  }
  {
    for (let at = 0; at < level.cells.length; at++) {
      const tile = level.cells[at]
      if (tile === null || tile === undefined) continue
      let certain = 0
      let possible = 0
      for (const feeder of feeders[at] ?? []) {
        const domain = reading[feeder.from] ?? []
        const pointing = domain.filter((rotation) => feeder.rotations.includes(rotation)).length
        if (pointing === domain.length && domain.length > 0) certain++
        if (pointing > 0) possible++
      }
      if (certain > tile.pips || possible < tile.pips) return "contradiction"
      if (certain === tile.pips && possible > certain) {
        // Full: every arm that could still point here must not.
        for (const feeder of feeders[at] ?? []) {
          const domain = reading[feeder.from] ?? []
          if (domain.every((rotation) => feeder.rotations.includes(rotation))) continue
          narrow(feeder.from, domain.filter((rotation) => !feeder.rotations.includes(rotation)))
        }
      } else if (possible === tile.pips && certain < possible) {
        // Only just enough: every arm that could point here must.
        for (const feeder of feeders[at] ?? []) {
          const domain = reading[feeder.from] ?? []
          const kept = domain.filter((rotation) => feeder.rotations.includes(rotation))
          if (kept.length > 0) narrow(feeder.from, kept)
        }
      }
    }
  }
  if (rules === "all" && forwardOnly(level, domains, reading)) changed = true
  if (domains.some((domain) => domain.length === 0)) return "contradiction"
  return changed
}

/** Propagates the rules until nothing changes. Returns `false` on a contradiction. */
const propagate = (level: Level, feeders: ReadonlyArray<ReadonlyArray<Feeder>>, domains: Domains, rules: Rules = "all"): boolean => {
  for (;;) {
    const result = pass(level, feeders, domains, rules)
    if (result === "contradiction") return false
    if (!result) return true
  }
}

export interface Solution {
  readonly rotations: Rotations
}

export interface SolveResult {
  /** Up to `limit` solutions. */
  readonly solutions: ReadonlyArray<Solution>
  /** The deepest stack of guesses needed to reach the first solution; 0 when propagation alone solves it. */
  readonly depth: number
  /** How many times the solver had to guess. */
  readonly guesses: number
}

/** Finds up to `limit` solutions. */
export const solve = (level: Level, limit = 2): SolveResult => {
  const feeders = feedersOf(level)
  const solutions: Array<Solution> = []
  let guesses = 0
  let firstDepth = -1
  const search = (domains: Domains, depth: number): void => {
    if (solutions.length >= limit) return
    if (!propagate(level, feeders, domains)) return
    let pick = -1
    let size = 5
    domains.forEach((domain, at) => {
      if (domain.length > 1 && domain.length < size) {
        pick = at
        size = domain.length
      }
    })
    if (pick < 0) {
      const rotations = domains.map((domain) => domain[0] ?? 0)
      if (fire(level, rotations).complete) {
        if (firstDepth < 0) firstDepth = depth
        solutions.push({ rotations })
      }
      return
    }
    for (const rotation of domains[pick] ?? []) {
      guesses++
      const next = domains.map((domain, at) => (at === pick ? [rotation] : domain))
      search(next, depth + 1)
      if (solutions.length >= limit) return
    }
  }
  search(initialDomains(level), 0)
  return { solutions, depth: Math.max(0, firstDepth), guesses }
}

/** How far the pips alone take a player: the cells propagation decides from the start. */
export const decidedByPropagation = (level: Level): number => {
  const domains = initialDomains(level)
  if (!propagate(level, feedersOf(level), domains)) return 0
  return domains.filter((domain, at) => level.cells[at] !== null && domain.length === 1).length
}

/**
 * The easy part of a chamber: how many turnable relays are decided by the
 * frame alone and by "that neighbour is already full", with no cut counts
 * ("only these arms can reach it, so they all must") and no firing. A
 * chamber mostly decided this way is bookkeeping, not deduction.
 */
export const trivialRatio = (level: Level): number => {
  const feeders = feedersOf(level)
  const domains = initialDomains(level)
  let changed = true
  while (changed) {
    changed = false
    for (let at = 0; at < level.cells.length; at++) {
      const tile = level.cells[at]
      if (tile === null || tile === undefined) continue
      let certain = 0
      for (const feeder of feeders[at] ?? []) {
        const domain = domains[feeder.from] ?? []
        if (domain.length > 0 && domain.every((rotation) => feeder.rotations.includes(rotation))) certain++
      }
      if (certain < tile.pips) continue
      for (const feeder of feeders[at] ?? []) {
        const domain = domains[feeder.from] ?? []
        if (domain.every((rotation) => feeder.rotations.includes(rotation))) continue
        const kept = domain.filter((rotation) => !feeder.rotations.includes(rotation))
        if (kept.length > 0 && kept.length !== domain.length) {
          domains[feeder.from] = kept
          changed = true
        }
      }
    }
  }
  let turnable = 0
  let decided = 0
  domains.forEach((domain, at) => {
    const tile = level.cells[at]
    if (tile === null || tile === undefined || tile.bolted || ROTATIONS[tile.shape].length < 2) return
    turnable++
    if (domain.length === 1) decided++
  })
  return turnable === 0 ? 1 : decided / turnable
}

/**
 * Solutions the sockets alone allow, ignoring the firing (up to `limit`):
 * the ones a player who only counts would accept. The forward-only rule is
 * what separates them from the real answer.
 */
export const solveCounting = (level: Level, limit = 50): ReadonlyArray<Rotations> => {
  const feeders = feedersOf(level)
  const found: Array<Rotations> = []
  const search = (domains: Domains): void => {
    if (found.length >= limit) return
    if (!propagate(level, feeders, domains, "sockets")) return
    let pick = -1
    let size = 5
    domains.forEach((domain, at) => {
      if (domain.length > 1 && domain.length < size) {
        pick = at
        size = domain.length
      }
    })
    if (pick < 0) {
      found.push(domains.map((domain) => domain[0] ?? 0))
      return
    }
    for (const rotation of domains[pick] ?? []) {
      search(domains.map((domain, at) => (at === pick ? [rotation] : domain)))
      if (found.length >= limit) return
    }
  }
  search(initialDomains(level))
  return found
}

/**
 * How much the forward-only rule matters: the fewest relays that differ
 * between a counting-only solution and the real one, over the counting-only
 * solutions that are not the real one. 0 when counting alone finds the
 * answer; the number of counting-only solutions is `others`.
 */
export const forwardNecessity = (level: Level, solution: Rotations): { readonly differing: number; readonly others: number } => {
  const counting = solveCounting(level, 50)
  let differing = -1
  let others = 0
  for (const candidate of counting) {
    const differs = candidate.filter((rotation, at) => rotation !== solution[at]).length
    if (differs === 0) continue
    others++
    if (differing < 0 || differs < differing) differing = differs
  }
  return { differing: Math.max(0, differing), others }
}

/** The relays each ember's cascade reaches in the solution, and how many both reach. */
export const emberCoupling = (level: Level, solution: Rotations): number => {
  const embers: Array<number> = []
  level.cells.forEach((tile, at) => {
    if (tile?.ember) embers.push(at)
  })
  if (embers.length < 2) return 0
  const arms = new Map<number, Array<number>>()
  level.cells.forEach((tile, at) => {
    if (tile === null) return
    arms.set(at, armsOf(tile.shape, solution[at] ?? 0).map((dir) => target(level, at, dir)).filter((to) => to >= 0))
  })
  const reach = (from: number): Set<number> => {
    const seen = new Set<number>([from])
    const queue = [from]
    while (queue.length > 0) {
      const at = queue.shift()
      if (at === undefined) break
      for (const to of arms.get(at) ?? []) {
        if (!seen.has(to)) {
          seen.add(to)
          queue.push(to)
        }
      }
    }
    return seen
  }
  const [first, ...rest] = embers
  if (first === undefined) return 0
  let shared = reach(first)
  for (const ember of rest) {
    const other = reach(ember)
    shared = new Set([...shared].filter((at) => other.has(at)))
  }
  return shared.size
}

/**
 * The shape of the solve: round by round, each round reading the board as
 * the previous one left it, how many relays were newly decided, until
 * nothing changes (a player solving without hypotheses). Many rounds that
 * decide one relay each is a line of dominoes; rounds that decide several
 * are wider fronts. `stuck` is how many turnable relays were left undecided.
 */
export const trace = (level: Level): { readonly decided: ReadonlyArray<number>; readonly stuck: number } => {
  const feeders = feedersOf(level)
  const domains = initialDomains(level)
  const singletons = (): number => domains.filter((domain, at) => {
    const tile = level.cells[at]
    return tile !== null && tile !== undefined && !tile.bolted && ROTATIONS[tile.shape].length > 1 && domain.length === 1
  }).length
  const decided: Array<number> = []
  let before = singletons()
  for (;;) {
    const result = pass(level, feeders, domains, "all", true)
    if (result === "contradiction" || !result) break
    const now = singletons()
    decided.push(now - before)
    before = now
  }
  const turnable = level.cells.filter((tile) => tile !== null && !tile.bolted && ROTATIONS[tile.shape].length > 1).length
  return { decided, stuck: turnable - before }
}
