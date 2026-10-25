/**
 * The chambers, as data. A chamber is written as rows of tokens:
 *
 *   `*i00`  an ember (`*`) with one arm (`i`), 0 sockets, starting at rotation 0
 *   `#L12`  a bolted (`#`) elbow with 1 socket, fixed at rotation 2
 *   `o1`    a lamp with 1 socket (lamps and crosses have no rotation)
 *   `..`    a hole
 *
 * The token is `[*#]<shape><sockets><rotation>`; the rotation is the start,
 * in quarter turns clockwise, and must be canonical for the shape (a straight
 * has 0 or 1). Rooms group chambers; the order here is the order of play.
 */
import { canonical, ROTATIONS, SHAPE_IDS, type Level, type Shape, type Tile } from "./rules.ts"

const isShape = (text: string): text is Shape => (SHAPE_IDS as ReadonlyArray<string>).includes(text)

/** Reads one token; throws on a malformed one, since content is checked when the module loads. */
const parseToken = (token: string, where: string): Tile | null => {
  if (token === "..") return null
  const match = /^([*#]?)([oiILTx])(\d)(\d?)$/.exec(token)
  if (match === null) throw new Error(`${where}: bad token "${token}"`)
  const [, flag, shapeText, pipsText, rotationText] = match
  if (shapeText === undefined || !isShape(shapeText) || pipsText === undefined) throw new Error(`${where}: bad token "${token}"`)
  const shape = shapeText
  const rotation = rotationText === undefined || rotationText === "" ? 0 : Number(rotationText)
  if (canonical(shape, rotation) !== rotation || !ROTATIONS[shape].includes(rotation)) throw new Error(`${where}: rotation ${rotation} is not canonical for ${shape}`)
  const pips = Number(pipsText)
  const ember = flag === "*"
  if (ember && pips !== 0) throw new Error(`${where}: an ember has no sockets`)
  if (!ember && pips === 0) throw new Error(`${where}: a relay needs at least one socket`)
  return { shape, pips, ember, bolted: flag === "#", start: rotation }
}

export const parseLevel = (id: string, name: string, rows: ReadonlyArray<string>): Level => {
  const grid = rows.map((row) => row.trim().split(/\s+/))
  const width = grid[0]?.length ?? 0
  const height = grid.length
  if (width === 0 || height === 0) throw new Error(`${id}: empty`)
  const cells: Array<Tile | null> = []
  grid.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${id}: row ${y} has ${row.length} cells, not ${width}`)
    row.forEach((token, x) => cells.push(parseToken(token, `${id} (${x},${y})`)))
  })
  return { id, name, width, height, cells }
}

export interface Room {
  readonly id: string
  readonly name: string
  readonly levels: ReadonlyArray<Level>
}

const level = (id: string, name: string, ...rows: Array<string>): Level => parseLevel(id, name, rows)

/** The rooms of the works, in the order they wake. */
export const ROOMS: ReadonlyArray<Room> = [
  {
    id: "lamp-room",
    name: "The Lamp Room",
    levels: [
      // The lever first: the ember starts aimed at the frame, and the spark fizzles.
      level("1-1", "Lever",
        "*i00 o1"),
      // Every arm has to land somewhere.
      level("1-2", "Pass It On",
        "*i03 L13 o1",
        ".. o1 .."),
      // A two-socket lamp: the middle single has to feed it, not the one-socket lamp.
      level("1-3", "Two Sockets",
        "o1 i13 o2",
        "i11 *T00 i12"),
      // A decoy satisfies every count, but the two-socket relay waits for a spark it has to send itself.
      level("1-4", "Two to Fire",
        "*L00 i11 o1",
        "i10 i21 i12"),
      // The lower block can only be entered through one door.
      level("1-5", "The Only Door",
        "*i00 i11 o1",
        ".. i13 i12",
        ".. i12 i13"),
      // An elbow and a two-socket relay in a small square, before the rooms grow.
      level("1-6", "Lantern",
        "i11 *i01 o1",
        "L10 i22 i11",
        "i10 L12 o1")
    ]
  },
  {
    id: "boiler",
    name: "The Boiler",
    levels: [
      level("2-1", "Pilot Light",
        "i10 L13 i11 o1",
        "i13 i10 *L03 I11",
        "i13 i23 i13 o2"),
      level("2-2", "Three Ways",
        "o2 L11 *L03 o1",
        "I11 T12 L20 i12",
        "o1 i10 i20 o1"),
      level("2-3", "Back Pressure",
        "i10 i11 i13 i11",
        "o2 L11 i10 i12",
        "o2 I10 o1 i12",
        "i11 L12 i11 *L00"),
      level("2-4", "Manifold",
        "o1 i11 i10 i11",
        "o1 i11 o1 i12",
        "i10 L12 i13 i13",
        "o1 *L02 L12 i12"),
      level("2-5", "Long Steam",
        "o1 i10 i13 i10 o2",
        "o1 L11 L10 I10 I11",
        "i10 i11 I10 L22 i23",
        "o2 i12 L12 *L02 o1"),
      level("2-6", "Pressure Gauge",
        "i10 L13 i10 o2 i10",
        "o1 i10 L13 T13 I11",
        "o1 i10 *I01 L10 o2",
        "i11 i20 I10 i23 o1")
    ]
  },
  {
    id: "gallery",
    name: "The Gallery",
    levels: [
      level("3-1", "Alcoves",
        ".. o1 .. o1 i10",
        "o1 i13 o2 L11 L10",
        "L13 i21 I11 i11 i13",
        "i13 *T00 o1 i13 i21",
        "o1 I10 i13 L13 i12"),
      level("3-2", "Colonnade",
        "i12 i23 L12 o2 o1",
        "*L03 L12 L22 I11 i13",
        "o1 .. i10 L23 I11",
        "i11 o1 .. L12 i21",
        "i11 L10 i11 i10 o1"),
      level("3-3", "Bolted",
        "o1 .. o1 I10 i10 i11",
        "i13 i11 #L12 L10 i12 i20",
        ".. o1 i20 L10 L11 o1",
        "o1 .. o1 .. #I10 *L03",
        "i11 i11 L10 i12 i20 i12"),
      level("3-4", "Through the Wall",
        "i10 L10 *i02 o1 i10 o1",
        "o2 L11 .. .. #i10 i13",
        "i10 #L12 .. i10 L10 L12",
        "i20 L10 .. o1 i10 I11",
        "o1 i12 i10 i10 i13 o1"),
      level("3-5", "Crossfire",
        "o2 i10 i10 i10 i10 i10",
        "i11 L22 L12 .. .. o1",
        "i10 L12 i12 .. o1 *L03",
        "i13 #I10 L21 L13 L13 L10",
        "#i12 o1 i12 i22 T13 o2",
        "o1 .. .. .. o1 .."),
      level("3-6", "The Long Gallery",
        "o1 I10 i10 o2 .. o1",
        "o2 L11 #I11 i12 .. i11",
        "i11 .. L13 #i21 L10 i12",
        "L12 o2 I11 *T03 o2 ..",
        "i13 L12 i20 L11 i22 i12",
        ".. .. .. i13 L12 i11")
    ]
  },
  {
    id: "flywheel",
    name: "The Flywheel",
    levels: [
      level("4-1", "Two Embers",
        "o1 .. i12 i10 L13 o1",
        "i12 .. i11 .. i13 i11",
        "i11 i13 L11 o1 i20 L11",
        "i11 L11 *I01 o1 L12 L11",
        ".. i21 i21 *L03 o1 L13",
        "o1 i11 .. o1 .. o1"),
      level("4-2", "Counterweights",
        ".. i10 i10 i10 i12 i11",
        "o1 L12 o2 L13 i12 i11",
        "i11 i21 i13 L12 .. i13",
        "*L03 T11 L13 i11 o1 L11",
        "o1 o1 o2 *L03 .. o1",
        ".. .. .. i10 i13 o1"),
      level("4-3", "Three Sockets",
        "o1 .. *i01 i10 o2 ..",
        "L12 o3 I10 L12 I21 *i02",
        "i11 T11 i22 i21 L11 ..",
        ".. i10 I11 L11 I10 i10",
        "o2 L10 i10 i23 i11 L11",
        "i13 i11 .. o1 .. o1"),
      level("4-4", "Gearbox",
        "o1 I10 o1 .. o1 ..",
        "o1 i13 .. o1 *T00 i10",
        "i12 T11 L10 i22 L13 i10",
        ".. i21 L11 I11 L23 *i00",
        "i11 i11 L12 i31 i10 ..",
        "o1 .. i13 i22 i10 o1"),
      // The sockets and the forward rule leave a ring that counts right and would stay dark: the island deduction, writ large.
      level("4-5", "The Dark Ring",
        "o2 i20 *L01 i12 i13 i13",
        "i11 *T00 i23 i22 .. o1",
        ".. i11 L11 L13 i11 ..",
        ".. i10 i13 .. L13 i10",
        "o1 L10 L10 L13 L13 i13",
        ".. i10 o2 i13 o2 o1"),
      level("4-6", "Awakening",
        ".. i13 i12 o1 .. o1 ..",
        "i12 i12 .. .. i13 I11 ..",
        "i13 i12 i12 o1 L10 i13 i13",
        "o1 .. i12 .. i13 .. o1",
        "L12 i22 L13 L13 L11 o2 ..",
        "I11 L11 i10 o2 i22 *x0 o1",
        "o1 .. i11 *I01 #L10 o2 ..")
    ]
  }
]

export const LEVELS: ReadonlyArray<Level> = ROOMS.flatMap((room) => room.levels)

const byId = new Map(LEVELS.map((entry) => [entry.id, entry]))

export const levelById = (id: string): Level | undefined => byId.get(id)

export const roomOf = (id: string): Room | undefined => ROOMS.find((room) => room.levels.some((entry) => entry.id === id))

/** The chamber after this one in the order of play, or `undefined` at the end. */
export const nextLevelId = (id: string): string | undefined => {
  const at = LEVELS.findIndex((entry) => entry.id === id)
  return at < 0 ? undefined : LEVELS[at + 1]?.id
}
