/**
 * The rules of the machine, as pure functions over plain data.
 *
 * A chamber is a grid of relays. Each relay has arms (strikers) that point
 * out of it in up to four directions, and sockets (its pips): how many
 * strikers must point at it. The player rotates relays. The machine is right
 * when
 *
 * 1. every arm points at a relay (a striker aimed at a wall or a hole wastes
 *    its spark),
 * 2. every relay is aimed at by exactly as many arms as it has sockets: a
 *    spark into a relay that already fired shorts it,
 * 3. lighting the embers fires every relay: a relay fires once every socket
 *    is filled, and sends a spark down each arm. So sparks only flow
 *    forward: a relay can never help fill the sockets of one that feeds it,
 *    and relays only aimed at by each other, in an island no ember reaches,
 *    stay dark.
 */

/** A direction: north, east, south, west, in turning order. */
export type Dir = 0 | 1 | 2 | 3

export const DIRS: ReadonlyArray<Dir> = [0, 1, 2, 3]

const DX: Readonly<Record<Dir, number>> = { 0: 0, 1: 1, 2: 0, 3: -1 }
const DY: Readonly<Record<Dir, number>> = { 0: -1, 1: 0, 2: 1, 3: 0 }

export const turn = (dir: Dir, by: number): Dir => (((dir + by) % 4) + 4) % 4 as Dir
export const opposite = (dir: Dir): Dir => turn(dir, 2)

/**
 * The arm shapes, as the arms at rotation 0. A relay's rotation turns them
 * all clockwise together.
 */
export const SHAPES = {
  /** No arms: a lamp. It only takes sparks. */
  o: [],
  /** One arm. */
  i: [0],
  /** Two arms, opposite. */
  I: [0, 2],
  /** Two arms, at a right angle. */
  L: [0, 1],
  /** Three arms. */
  T: [0, 1, 2],
  /** Four arms. */
  x: [0, 1, 2, 3]
} as const satisfies Record<string, ReadonlyArray<Dir>>

export type Shape = keyof typeof SHAPES
export const SHAPE_IDS: ReadonlyArray<Shape> = ["o", "i", "I", "L", "T", "x"]

/** The rotations a shape can be told apart in: a straight has two, a cross one. */
export const ROTATIONS: Readonly<Record<Shape, ReadonlyArray<number>>> = {
  o: [0],
  i: [0, 1, 2, 3],
  I: [0, 1],
  L: [0, 1, 2, 3],
  T: [0, 1, 2, 3],
  x: [0]
}

/** The arm directions of a shape turned `rotation` quarter turns clockwise. */
export const armsOf = (shape: Shape, rotation: number): ReadonlyArray<Dir> => SHAPES[shape].map((dir) => turn(dir, rotation))

/** The smallest rotation that gives the same arms as `rotation`. */
export const canonical = (shape: Shape, rotation: number): number => {
  const period = ROTATIONS[shape].length
  return ((rotation % period) + period) % period
}

/** One relay of a chamber, as the level authors it. */
export interface Tile {
  readonly shape: Shape
  /** Its sockets: how many strikers must point at it. Embers have 0. */
  readonly pips: number
  /** An ember lights itself when the lever is pulled. */
  readonly ember: boolean
  /** A bolted relay cannot be turned. */
  readonly bolted: boolean
  /** The rotation the level starts in. */
  readonly start: number
}

/** A chamber: a grid whose cells hold a relay or nothing (a hole). */
export interface Level {
  readonly id: string
  readonly name: string
  readonly width: number
  readonly height: number
  /** Row-major, `width * height` entries; `null` is a hole. */
  readonly cells: ReadonlyArray<Tile | null>
}

/** The player's rotations, row-major, one per cell (ignored for holes). */
export type Rotations = ReadonlyArray<number>

export const index = (level: { readonly width: number }, x: number, y: number): number => y * level.width + x

export const inBounds = (level: Level, x: number, y: number): boolean => x >= 0 && y >= 0 && x < level.width && y < level.height

/** The cell an arm from `from` pointing `dir` strikes, or -1 when it leaves the board or hits a hole. */
export const target = (level: Level, from: number, dir: Dir): number => {
  const x = (from % level.width) + DX[dir]
  const y = Math.floor(from / level.width) + DY[dir]
  if (!inBounds(level, x, y)) return -1
  const at = index(level, x, y)
  return level.cells[at] === null ? -1 : at
}

export const startRotations = (level: Level): Rotations => level.cells.map((tile) => (tile === null ? 0 : tile.start))

/** One striker of the configured machine. */
export interface Arm {
  readonly from: number
  readonly dir: Dir
  /** The relay struck, or -1 when the spark is wasted. */
  readonly to: number
}

/** Every arm of the machine at these rotations. */
export const armsAt = (level: Level, rotations: Rotations): ReadonlyArray<Arm> => {
  const arms: Array<Arm> = []
  level.cells.forEach((tile, from) => {
    if (tile === null) return
    for (const dir of armsOf(tile.shape, rotations[from] ?? 0)) arms.push({ from, dir, to: target(level, from, dir) })
  })
  return arms
}

/** How many arms point at each cell. */
export const incoming = (level: Level, arms: ReadonlyArray<Arm>): ReadonlyArray<number> => {
  const counts = level.cells.map(() => 0)
  for (const arm of arms) if (arm.to >= 0) counts[arm.to] = (counts[arm.to] ?? 0) + 1
  return counts
}

/** What one spark did when the lever was pulled. */
export type Outcome = "struck" | "wasted" | "short"

export interface Spark {
  readonly arm: Arm
  readonly outcome: Outcome
}

/** One beat of the firing: the relays that fire together and the sparks they send. */
export interface Wave {
  readonly fired: ReadonlyArray<number>
  readonly sparks: ReadonlyArray<Spark>
}

export type Fault = "wasted" | "short" | "dark" | "starved"

export interface Firing {
  readonly waves: ReadonlyArray<Wave>
  /** Every relay fired, no spark wasted or shorted. */
  readonly complete: boolean
  /** Relays no spark reached. */
  readonly dark: ReadonlyArray<number>
  /** Relays that took some sparks but never filled: half-charged, waiting for a spark that cannot come. */
  readonly starved: ReadonlyArray<number>
  /** Sparks each relay took, by cell. */
  readonly received: ReadonlyArray<number>
  readonly fault: Fault | null
}

/**
 * Pulls the lever: embers fire first, and each wave of sparks fills sockets;
 * a relay whose sockets are all filled fires in the next wave. A spark into
 * a relay that already fired is a short. The firing runs to the end so the
 * player sees everything that went wrong, and `fault` names the first kind.
 */
export const fire = (level: Level, rotations: Rotations): Firing => {
  const waves: Array<Wave> = []
  const received = level.cells.map(() => 0)
  const fired = level.cells.map(() => false)
  let fault: Fault | null = null
  const note = (kind: Fault): void => {
    if (fault === null) fault = kind
  }
  let ready: Array<number> = []
  level.cells.forEach((tile, at) => {
    if (tile !== null && tile.ember) ready.push(at)
  })
  while (ready.length > 0) {
    const sparks: Array<Spark> = []
    const next: Array<number> = []
    for (const from of ready) fired[from] = true
    for (const from of ready) {
      const tile = level.cells[from]
      if (tile === null || tile === undefined) continue
      for (const dir of armsOf(tile.shape, rotations[from] ?? 0)) {
        const to = target(level, from, dir)
        const arm: Arm = { from, dir, to }
        if (to < 0) {
          sparks.push({ arm, outcome: "wasted" })
          note("wasted")
          continue
        }
        const struck = level.cells[to]
        if (struck === null || struck === undefined) continue
        received[to] = (received[to] ?? 0) + 1
        if (fired[to] || (received[to] ?? 0) > struck.pips) {
          sparks.push({ arm, outcome: "short" })
          note("short")
          continue
        }
        sparks.push({ arm, outcome: "struck" })
        if (received[to] === struck.pips && !next.includes(to)) next.push(to)
      }
    }
    waves.push({ fired: ready, sparks })
    ready = next
  }
  const dark: Array<number> = []
  const starved: Array<number> = []
  level.cells.forEach((tile, at) => {
    if (tile === null || fired[at]) return
    if ((received[at] ?? 0) > 0) starved.push(at)
    else dark.push(at)
  })
  if (starved.length > 0) note("starved")
  if (dark.length > 0) note("dark")
  return { waves, complete: fault === null, dark, starved, received, fault }
}

/** Whether the machine at these rotations is right, without the firing's detail. */
export const solved = (level: Level, rotations: Rotations): boolean => fire(level, rotations).complete

/** How many relays the player can turn. */
export const movable = (level: Level): number => level.cells.filter((tile) => tile !== null && !tile.bolted && ROTATIONS[tile.shape].length > 1).length
