/**
 * Where the chamber sits on the screen: the grid is centred and fitted to the
 * window with room for the HUD, never smaller than a comfortable touch.
 */
import type { Level } from "../sim/rules.ts"

export interface Layout {
  readonly cell: number
  readonly originX: number
  readonly originY: number
  readonly width: number
  readonly height: number
}

export const MIN_CELL = 44
export const MAX_CELL = 112

export const layoutFor = (level: Level, viewWidth: number, viewHeight: number): Layout => {
  // Room for the title and the conduit above, the note and the lever below.
  const top = viewHeight < 700 ? 92 : 112
  const bottom = viewHeight < 700 ? 128 : 150
  // The brass frame sits outside the grid: leave it room at the sides.
  const side = viewWidth < 520 ? 26 : 40
  const availableWidth = viewWidth - side * 2
  const availableHeight = viewHeight - top - bottom
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(availableWidth / level.width, availableHeight / level.height))))
  const width = cell * level.width
  const height = cell * level.height
  return {
    cell,
    originX: Math.round((viewWidth - width) / 2),
    originY: Math.round(top + Math.max(0, (availableHeight - height) / 2)),
    width,
    height
  }
}

/** The cell under a screen point, or -1 outside the grid. */
export const cellAt = (level: Level, layout: Layout, x: number, y: number): number => {
  const column = Math.floor((x - layout.originX) / layout.cell)
  const row = Math.floor((y - layout.originY) / layout.cell)
  if (column < 0 || row < 0 || column >= level.width || row >= level.height) return -1
  return row * level.width + column
}
