/** The chamber's colours, as Pixi numbers. */
export const SLATE = 0x1b1e24
export const SLATE_LIGHT = 0x262a33
export const INK = 0x0d0f13
export const BRASS = 0xc99a3b
export const BRASS_DIM = 0x8a6a2a
export const BRASS_DARK = 0x4a3914
export const BRASS_BRIGHT = 0xf0c86a
export const EMBER = 0xff7a1a
export const EMBER_DEEP = 0xc2470a
export const GLOW = 0xffd27a
export const SPARK = 0xfff3c4
export const RED = 0xff4d5e
export const COLD = 0x3b4a66
export const GLASS = 0x5b6472
export const PAPER = 0xece3cf

/** Linear blend of two colours. */
export const mix = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, t))
  const channel = (shift: number) => {
    const x = (a >> shift) & 0xff
    const y = (b >> shift) & 0xff
    return Math.round(x + (y - x) * k) << shift
  }
  return channel(16) | channel(8) | channel(0)
}
