/**
 * Draws the chamber with Pixi from the view: a riveted brass frame around a
 * slate board, each relay a brass disc with rotating striker arms and fixed
 * sockets, sparks racing along the arms while the lever is down, and the
 * glow of relays that fired. Easing (rotation springs, flares, rings) lives
 * here: the simulation holds only what the player decided.
 */
import { Application, Container, Graphics } from "pixi.js"

import { armsAt, armsOf, index, type Firing, type Level, type Spark } from "../sim/rules.ts"
import type { ChamberView, RelayView } from "../sim/view.ts"
import { WAVE_TICKS } from "../sim/timing.ts"
import { layoutFor, type Layout } from "./layout.ts"
import { BRASS, BRASS_BRIGHT, BRASS_DARK, BRASS_DIM, COLD, EMBER, EMBER_DEEP, GLASS, GLOW, INK, mix, PAPER, RED, SLATE, SLATE_LIGHT, SPARK } from "./palette.ts"

const TAU = Math.PI * 2

interface Node {
  readonly root: Container
  readonly base: Graphics
  readonly arms: Container
  readonly armsShape: Graphics
  readonly plate: Graphics
  readonly marks: Graphics
  /** The angle drawn, which springs toward the rotation decided. */
  shown: number
  velocity: number
  /** 0 when dark, rising to 1 as the relay lights. */
  lit: number
  /** Pressed-down squash, for taps. */
  press: number
  view: RelayView
}

interface Ring {
  x: number
  y: number
  radius: number
  life: number
  color: number
}

interface Puff {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: number
  size: number
}

export interface Hover {
  readonly cell: number
  readonly down: boolean
}

export class Renderer {
  readonly app: Application
  private readonly world = new Container()
  private readonly frame = new Graphics()
  private readonly board = new Graphics()
  private readonly tiles = new Container()
  private readonly sparks = new Graphics()
  private readonly fx = new Graphics()
  private readonly conduit = new Graphics()
  private nodes = new Map<number, Node>()
  private level: Level | null = null
  private layout: Layout | null = null
  private view: ChamberView | null = null
  private previousView: ChamberView | null = null
  private rings: Array<Ring> = []
  private puffs: Array<Puff> = []
  private time = 0
  private hover: Hover | null = null
  /** Live sockets: how many arms aim at each cell right now. */
  private aimed: ReadonlyArray<number> = []
  /** How far through the firing the spark animation is, in frames, for smooth motion between fixed steps. */
  private firingClock = 0

  private constructor(app: Application) {
    this.app = app
    this.world.addChild(this.frame, this.board, this.conduit, this.tiles, this.sparks, this.fx)
    app.stage.addChild(this.world)
    window.addEventListener("resize", () => this.fit())
  }

  static async create(host: HTMLElement): Promise<Renderer> {
    const app = new Application()
    await app.init({ background: SLATE, resizeTo: window, antialias: true, resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true })
    host.appendChild(app.canvas)
    app.ticker.stop()
    return new Renderer(app)
  }

  get currentLayout(): Layout | null {
    return this.layout
  }

  setHover(hover: Hover | null): void {
    this.hover = hover
  }

  /** A relay was tapped: squash it a little. */
  pressed(cell: number): void {
    const node = this.nodes.get(cell)
    if (node) node.press = 1
  }

  private fit(): void {
    this.app.renderer.resize(window.innerWidth, window.innerHeight)
    if (this.level !== null) this.rebuild(this.level)
  }

  /** Called once per simulation step with the new view. */
  step(view: ChamberView): void {
    this.previousView = this.view
    this.view = view
    const level = view.level
    if (level === null) {
      this.level = null
      this.layout = null
      this.tiles.removeChildren()
      this.nodes.clear()
      return
    }
    if (level !== this.level || this.previousView?.level?.id !== level.id) this.rebuild(level)
    const rotations = level.cells.map(() => 0)
    for (const relay of view.relays) rotations[relay.cell] = relay.rotation
    const counts = level.cells.map(() => 0)
    for (const arm of armsAt(level, rotations)) if (arm.to >= 0) counts[arm.to] = (counts[arm.to] ?? 0) + 1
    this.aimed = counts
    for (const relay of view.relays) {
      const node = this.nodes.get(relay.cell)
      if (node === undefined) continue
      const was = node.view
      node.view = relay
      if (relay.wave !== null && was.wave === null) {
        // Fired this step: a flare and a ring.
        const { x, y } = this.centre(relay.cell)
        this.rings.push({ x, y, radius: this.cellSize() * 0.3, life: 1, color: relay.ember ? EMBER : GLOW })
        node.lit = Math.max(node.lit, 0.35)
      }
      if (relay.shorted && !was.shorted) {
        const { x, y } = this.centre(relay.cell)
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * TAU
          this.puffs.push({ x, y, vx: Math.cos(angle) * 1.8, vy: Math.sin(angle) * 1.8, life: 1, color: RED, size: 3 })
        }
      }
    }
    if (view.phase.tag === "Firing") {
      const previous = this.previousView?.phase
      if (previous?.tag !== "Firing") this.firingClock = 0
      // Wasted sparks fizzle at the moment they leave the board: a grey puff at the frame.
      if (view.phase.step === 1 && view.firing !== null) {
        const wave = view.firing.waves[view.phase.wave]
        for (const spark of wave?.sparks ?? []) {
          if (spark.outcome !== "wasted") continue
          const end = this.sparkEnd(spark)
          for (let i = 0; i < 5; i++) this.puffs.push({ x: end.x, y: end.y, vx: (Math.random() - 0.5) * 1.2, vy: -0.6 - Math.random(), life: 1, color: GLASS, size: 2.5 })
        }
      }
    }
    if (view.phase.tag === "Solved" && this.previousView?.phase.tag !== "Solved") {
      const { x, y } = this.boardCentre()
      this.rings.push({ x, y, radius: this.cellSize() * 0.5, life: 1.6, color: GLOW })
    }
  }

  private cellSize(): number {
    return this.layout?.cell ?? 64
  }

  private centre(cell: number): { x: number; y: number } {
    const level = this.level
    const layout = this.layout
    if (level === null || layout === null) return { x: 0, y: 0 }
    return {
      x: layout.originX + ((cell % level.width) + 0.5) * layout.cell,
      y: layout.originY + (Math.floor(cell / level.width) + 0.5) * layout.cell
    }
  }

  private boardCentre(): { x: number; y: number } {
    const layout = this.layout
    if (layout === null) return { x: 0, y: 0 }
    return { x: layout.originX + layout.width / 2, y: layout.originY + layout.height / 2 }
  }

  private rebuild(level: Level): void {
    this.level = level
    const layout = layoutFor(level, window.innerWidth, window.innerHeight)
    this.layout = layout
    this.tiles.removeChildren()
    this.nodes.clear()
    this.rings = []
    this.puffs = []
    this.drawFrame(level, layout)
    const view = this.view
    if (view === null) return
    for (const relay of view.relays) {
      const node = this.makeNode(relay, layout.cell)
      const { x, y } = this.centre(relay.cell)
      node.root.position.set(x, y)
      this.tiles.addChild(node.root)
      this.nodes.set(relay.cell, node)
    }
  }

  private drawFrame(level: Level, layout: Layout): void {
    const g = this.frame
    g.clear()
    const pad = Math.max(10, layout.cell * 0.18)
    const x = layout.originX - pad
    const y = layout.originY - pad
    const w = layout.width + pad * 2
    const h = layout.height + pad * 2
    // The brass frame, with a darker inner lip and rivets.
    g.roundRect(x - 6, y - 6, w + 12, h + 12, 18).fill(BRASS_DARK)
    g.roundRect(x - 3, y - 3, w + 6, h + 6, 16).fill(BRASS_DIM)
    g.roundRect(x, y, w, h, 13).fill(INK)
    const rivet = Math.max(2.2, layout.cell * 0.045)
    const step = Math.max(28, layout.cell * 0.5)
    for (let rx = x + 8; rx < x + w - 4; rx += step) {
      g.circle(rx, y - 1, rivet).fill(BRASS_BRIGHT)
      g.circle(rx, y + h + 1, rivet).fill(BRASS_BRIGHT)
    }
    for (let ry = y + 8; ry < y + h - 4; ry += step) {
      g.circle(x - 1, ry, rivet).fill(BRASS_BRIGHT)
      g.circle(x + w + 1, ry, rivet).fill(BRASS_BRIGHT)
    }
    // The board: slate cells, holes left as the frame's ink.
    const b = this.board
    b.clear()
    for (let row = 0; row < level.height; row++) {
      for (let column = 0; column < level.width; column++) {
        const tile = level.cells[index(level, column, row)]
        if (tile === null || tile === undefined) continue
        const cx = layout.originX + column * layout.cell
        const cy = layout.originY + row * layout.cell
        b.roundRect(cx + 2, cy + 2, layout.cell - 4, layout.cell - 4, Math.max(4, layout.cell * 0.1)).fill((row + column) % 2 === 0 ? SLATE_LIGHT : mix(SLATE_LIGHT, SLATE, 0.5))
      }
    }
  }

  private makeNode(relay: RelayView, cell: number): Node {
    const root = new Container()
    const base = new Graphics()
    const arms = new Container()
    const armsShape = new Graphics()
    const plate = new Graphics()
    const marks = new Graphics()
    arms.addChild(armsShape)
    root.addChild(base, arms, plate, marks)
    const node: Node = { root, base, arms, armsShape, plate, marks, shown: relay.rotation, velocity: 0, lit: 0, press: 0, view: relay }
    this.drawArms(node, cell)
    return node
  }

  /** The striker arms at rotation 0, drawn once; the container turns. */
  private drawArms(node: Node, cell: number): void {
    const g = node.armsShape
    g.clear()
    const relay = node.view
    const inner = cell * 0.22
    const outer = cell * 0.47
    const width = Math.max(4, cell * 0.11)
    for (const dir of armsOf(relay.shape, 0)) {
      const angle = (dir / 4) * TAU - Math.PI / 2
      const ux = Math.cos(angle)
      const uy = Math.sin(angle)
      const px = -uy
      const py = ux
      // The shaft.
      g.moveTo(ux * inner + px * width * 0.5, uy * inner + py * width * 0.5)
        .lineTo(ux * (outer - width * 0.9) + px * width * 0.5, uy * (outer - width * 0.9) + py * width * 0.5)
        .lineTo(ux * (outer - width * 0.9) - px * width * 0.5, uy * (outer - width * 0.9) - py * width * 0.5)
        .lineTo(ux * inner - px * width * 0.5, uy * inner - py * width * 0.5)
        .closePath()
        .fill(relay.ember ? EMBER_DEEP : BRASS_DIM)
      // The hammer head: a wedge aimed at the neighbour.
      const headBack = outer - width * 1.1
      g.moveTo(ux * headBack + px * width * 1.1, uy * headBack + py * width * 1.1)
        .lineTo(ux * outer + px * width * 0.45, uy * outer + py * width * 0.45)
        .lineTo(ux * outer - px * width * 0.45, uy * outer - py * width * 0.45)
        .lineTo(ux * headBack - px * width * 1.1, uy * headBack - py * width * 1.1)
        .closePath()
        .fill(relay.ember ? EMBER : BRASS)
    }
  }

  private sparkEnd(spark: Spark): { x: number; y: number } {
    const from = this.centre(spark.arm.from)
    const cell = this.cellSize()
    const angle = (spark.arm.dir / 4) * TAU - Math.PI / 2
    if (spark.arm.to >= 0) return this.centre(spark.arm.to)
    return { x: from.x + Math.cos(angle) * cell * 0.5, y: from.y + Math.sin(angle) * cell * 0.5 }
  }

  /** Called every browser frame; `frames` is how much time passed in 60 Hz frames. */
  draw(frames: number): void {
    this.time += frames
    const view = this.view
    const level = this.level
    if (view === null || level === null || this.layout === null) {
      this.app.render()
      return
    }
    if (view.phase.tag === "Firing") this.firingClock += frames
    const cell = this.layout.cell
    const firing = view.firing
    const received = this.receivedSoFar(view, firing)
    for (const node of this.nodes.values()) this.drawNode(node, cell, view, received)
    this.drawSparks(view, firing, cell)
    this.drawFx(frames)
    this.drawConduit(view)
    // The fixed loop drives drawing; Pixi's own ticker is stopped.
    this.app.render()
  }

  /** Sparks each relay holds at this moment of the firing, for the sockets. */
  private receivedSoFar(view: ChamberView, firing: Firing | null): ReadonlyArray<number> | null {
    const level = this.level
    if (firing === null || level === null) return null
    const counts = level.cells.map(() => 0)
    const upTo = view.phase.tag === "Firing" ? view.phase.wave - 1 : firing.waves.length
    firing.waves.forEach((wave, at) => {
      if (at > upTo) return
      for (const spark of wave.sparks) if (spark.outcome !== "wasted") counts[spark.arm.to] = (counts[spark.arm.to] ?? 0) + 1
    })
    // Sparks of the wave in flight land as they arrive.
    if (view.phase.tag === "Firing") {
      const progress = Math.min(1, (view.phase.step + (this.firingClock % 1)) / (WAVE_TICKS * 0.7))
      const wave = firing.waves[view.phase.wave]
      if (progress >= 1 && wave) for (const spark of wave.sparks) if (spark.outcome !== "wasted") counts[spark.arm.to] = (counts[spark.arm.to] ?? 0) + 1
    }
    return counts
  }

  private drawNode(node: Node, cell: number, view: ChamberView, received: ReadonlyArray<number> | null): void {
    const relay = node.view
    // The arms spring toward the decided rotation, overshooting a little.
    const targetAngle = relay.rotation
    let delta = targetAngle - node.shown
    // Turn the short way, usually forward.
    while (delta > 2) delta -= 4
    while (delta < -2) delta += 4
    const k = 0.32
    const damping = 0.68
    node.velocity = (node.velocity + delta * k) * damping
    node.shown += node.velocity
    if (Math.abs(delta) < 0.002 && Math.abs(node.velocity) < 0.002) {
      node.shown = targetAngle
      node.velocity = 0
    }
    node.arms.rotation = (node.shown / 4) * TAU
    node.press = Math.max(0, node.press - 0.12)
    const squash = 1 - node.press * 0.08
    node.root.scale.set(squash)

    const litTarget = relay.wave !== null ? 1 : 0
    node.lit += (litTarget - node.lit) * (litTarget > node.lit ? 0.25 : 0.12)
    const lit = node.lit
    const hovered = this.hover?.cell === relay.cell && view.phase.tag === "Editing" && !relay.bolted && relay.shape !== "o" && relay.shape !== "x"
    const radius = cell * 0.3
    const g = node.base
    g.clear()
    // The disc.
    const dark = relay.ember ? EMBER_DEEP : relay.shape === "o" ? GLASS : relay.bolted || relay.shape === "x" ? BRASS_DARK : BRASS_DIM
    const bright = relay.ember ? EMBER : relay.shape === "o" ? SPARK : GLOW
    const breath = relay.ember && lit < 0.5 ? 0.5 + 0.5 * Math.sin(this.time * 0.08) : 0
    const fill = mix(mix(dark, bright, lit), bright, breath * 0.35)
    if (lit > 0.05 || breath > 0) {
      g.circle(0, 0, radius * (1.25 + 0.25 * lit)).fill({ color: bright, alpha: 0.12 + 0.22 * lit + breath * 0.1 })
    }
    g.circle(0, 0, radius).fill(fill)
    g.circle(0, 0, radius).stroke({ width: Math.max(1.5, cell * 0.03), color: relay.shape === "o" ? mix(GLASS, PAPER, 0.3) : mix(BRASS_DARK, BRASS_BRIGHT, lit), alpha: 0.9 })
    if (relay.shape === "o") {
      // A lamp: glass with a highlight.
      g.circle(-radius * 0.3, -radius * 0.35, radius * 0.22).fill({ color: PAPER, alpha: 0.25 + lit * 0.5 })
    }
    if (relay.bolted || relay.shape === "x") {
      // Rivets: a given that does not turn.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4
        g.circle(Math.cos(a) * radius * 0.78, Math.sin(a) * radius * 0.78, Math.max(1.5, cell * 0.03)).fill(BRASS_BRIGHT)
      }
    }
    if (hovered) g.circle(0, 0, radius * 1.12).stroke({ width: 2, color: BRASS_BRIGHT, alpha: 0.5 })
    node.armsShape.alpha = 1
    node.armsShape.tint = relay.ember ? 0xffffff : lit > 0.5 ? mix(0xffffff, GLOW, lit) : 0xffffff

    // The plate with the sockets, fixed while the arms turn.
    const p = node.plate
    p.clear()
    if (!relay.ember) {
      const socket = Math.max(2.5, cell * 0.055)
      const spots = socketSpots(relay.pips, radius * 0.42)
      const aimed = this.aimed[relay.cell] ?? 0
      const held = received === null ? 0 : (received[relay.cell] ?? 0)
      const inFiring = view.phase.tag !== "Editing"
      spots.forEach(([sx, sy], at) => {
        p.circle(sx, sy, socket).fill(INK)
        const filledNow = inFiring ? at < held : false
        const aimedNow = !inFiring && at < aimed
        if (filledNow) p.circle(sx, sy, socket * 0.75).fill(relay.wave !== null ? SPARK : GLOW)
        else if (aimedNow) p.circle(sx, sy, socket * 0.68).fill({ color: GLOW, alpha: 0.7 })
      })
      // Over-aimed: a jagged mark on the rim.
      const over = inFiring ? held > relay.pips : aimed > relay.pips
      if (over || relay.shorted) {
        const r = radius * 0.95
        p.moveTo(r * 0.55, -r * 0.9).lineTo(r * 0.75, -r * 0.55).lineTo(r * 0.5, -r * 0.5).lineTo(r * 0.85, -r * 0.1).stroke({ width: Math.max(2, cell * 0.035), color: RED })
      }
    }
    // Marks: lock ring and scorch.
    const m = node.marks
    m.clear()
    if (relay.locked) {
      const r = radius * 1.28
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * TAU
        const a1 = a0 + TAU / 24
        m.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a1)
      }
      m.stroke({ width: Math.max(2, cell * 0.035), color: PAPER, alpha: 0.75 })
    }
    if (relay.scorched) {
      m.circle(radius * 0.35, radius * 0.4, radius * 0.3).fill({ color: INK, alpha: 0.55 })
      m.circle(radius * 0.1, radius * 0.6, radius * 0.2).fill({ color: INK, alpha: 0.4 })
    }
    // Faults held after a failed strike: starved relays glow cold and half, dark ones sink.
    if (view.phase.tag === "Settling" && view.firing !== null) {
      if (view.firing.starved.includes(relay.cell)) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.15)
        m.circle(0, 0, radius * 1.1).stroke({ width: 2.5, color: mix(COLD, GLOW, pulse), alpha: 0.9 })
      } else if (view.firing.dark.includes(relay.cell)) {
        m.circle(0, 0, radius * 1.1).stroke({ width: 2, color: COLD, alpha: 0.8 })
      }
    }
  }

  private drawSparks(view: ChamberView, firing: Firing | null, cell: number): void {
    const g = this.sparks
    g.clear()
    if (firing === null) return
    if (view.phase.tag === "Firing") {
      const wave = firing.waves[view.phase.wave]
      if (wave === undefined) return
      const travel = WAVE_TICKS * 0.7
      const raw = (view.phase.step + (this.firingClock % 1)) / travel
      const progress = Math.min(1, raw)
      for (const spark of wave.sparks) {
        const from = this.centre(spark.arm.from)
        const end = this.sparkEnd(spark)
        const startAt = 0.25
        const t = Math.max(0, Math.min(1, (progress - startAt) / (1 - startAt)))
        const x = from.x + (end.x - from.x) * t
        const y = from.y + (end.y - from.y) * t
        if (t >= 1 && spark.outcome === "wasted") continue
        if (t <= 0) continue
        // A trail behind the dot.
        const tx = from.x + (end.x - from.x) * Math.max(0, t - 0.35)
        const ty = from.y + (end.y - from.y) * Math.max(0, t - 0.35)
        g.moveTo(tx, ty).lineTo(x, y).stroke({ width: Math.max(2, cell * 0.05), color: spark.outcome === "short" ? RED : GLOW, alpha: 0.6 })
        g.circle(x, y, Math.max(3, cell * 0.075)).fill({ color: SPARK, alpha: 0.9 })
        g.circle(x, y, Math.max(5, cell * 0.14)).fill({ color: spark.outcome === "short" ? RED : GLOW, alpha: 0.25 })
      }
    } else if (view.phase.tag === "Settling") {
      // Faults stay drawn: wasted sparks as a grey mark at the frame, shorts as a red jag at the target.
      for (const wave of firing.waves) {
        for (const spark of wave.sparks) {
          if (spark.outcome === "struck") continue
          const end = this.sparkEnd(spark)
          if (spark.outcome === "wasted") {
            g.circle(end.x, end.y, Math.max(3, cell * 0.06)).fill({ color: GLASS, alpha: 0.6 })
            g.circle(end.x, end.y, Math.max(6, cell * 0.12)).stroke({ width: 1.5, color: GLASS, alpha: 0.5 })
          } else {
            const from = this.centre(spark.arm.from)
            const mx = (from.x + end.x) / 2
            const my = (from.y + end.y) / 2
            g.moveTo(from.x, from.y).lineTo(mx + 4, my - 4).lineTo(mx - 4, my + 4).lineTo(end.x, end.y).stroke({ width: 2, color: RED, alpha: 0.8 })
          }
        }
      }
    }
  }

  private drawFx(frames: number): void {
    const g = this.fx
    g.clear()
    const cell = this.cellSize()
    this.rings = this.rings.filter((ring) => ring.life > 0)
    for (const ring of this.rings) {
      ring.life -= frames * 0.045
      ring.radius += frames * cell * 0.06
      g.circle(ring.x, ring.y, ring.radius).stroke({ width: Math.max(1.5, cell * 0.04) * Math.max(0, ring.life), color: ring.color, alpha: Math.max(0, ring.life) * 0.8 })
    }
    this.puffs = this.puffs.filter((puff) => puff.life > 0)
    for (const puff of this.puffs) {
      puff.life -= frames * 0.04
      puff.x += puff.vx * frames
      puff.y += puff.vy * frames
      puff.vy -= 0.02 * frames
      g.circle(puff.x, puff.y, puff.size * Math.max(0, puff.life)).fill({ color: puff.color, alpha: Math.max(0, puff.life) * 0.8 })
    }
  }

  /** The pipe out of the chamber fills with light once it is solved. */
  private drawConduit(view: ChamberView): void {
    const layout = this.layout
    if (layout === null) return
    const c = this.conduit
    c.clear()
    const pad = Math.max(10, layout.cell * 0.18)
    const top = layout.originY - pad - 6
    const px = layout.originX + layout.width / 2
    // A short pipe out of the frame, ending in a valve the spark reaches when the chamber is lit; never into the title.
    const rise = Math.min(40, top - 66)
    if (rise < 12) return
    const end = top - rise
    c.roundRect(px - 7, end, 14, rise + 4, 5).fill(BRASS_DIM)
    c.roundRect(px - 4, end + 3, 8, rise - 2, 3).fill(INK)
    c.circle(px, end, 9).fill(BRASS_DIM)
    c.circle(px, end, 5).fill(INK)
    if (view.phase.tag === "Solved") {
      const t = Math.min(1, view.phase.step / 40)
      const length = (rise - 2) * t
      c.roundRect(px - 3, top - length, 6, length, 3).fill({ color: GLOW, alpha: 0.9 })
      if (t >= 1) {
        c.circle(px, end, 5 + 1.5 * Math.sin(this.time * 0.1)).fill({ color: SPARK, alpha: 0.95 })
        c.circle(px, end, 14 + 3 * Math.sin(this.time * 0.1)).fill({ color: GLOW, alpha: 0.18 })
      }
    }
  }
}

/** Where a relay's sockets sit on its plate. */
const socketSpots = (pips: number, spread: number): Array<[number, number]> => {
  if (pips <= 1) return [[0, 0]]
  if (pips === 2) return [[-spread * 0.8, 0], [spread * 0.8, 0]]
  return [[0, -spread * 0.9], [-spread * 0.8, spread * 0.55], [spread * 0.8, spread * 0.55]]
}
