/**
 * Every sound is synthesised: a mechanical tick for a turn, a bell for each
 * relay that fires (its pitch climbing a pentatonic scale with each wave),
 * a fizzle for a wasted spark, a buzz for a short, and a warm chord when the
 * chamber lights up.
 */
import type { Cue } from "../sim/schema.ts"

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28]
const BASE = 330

export class Sound {
  muted = false
  private context: AudioContext | null = null
  private master: GainNode | null = null

  /** Browsers only start audio after a gesture: call this from any input. */
  unlock(): void {
    if (this.context !== null) return
    try {
      const context = new AudioContext()
      const master = context.createGain()
      master.gain.value = 0.35
      master.connect(context.destination)
      this.context = context
      this.master = master
    } catch {
      this.context = null
    }
  }

  play(cue: Cue): void {
    if (this.muted || this.context === null || this.master === null) return
    if (this.context.state === "suspended") void this.context.resume()
    switch (cue.kind) {
      case "turn":
        this.click(900, 0.04, 0.5)
        this.click(400, 0.07, 0.3)
        return
      case "lock":
        this.click(cue.locked ? 1400 : 700, 0.05, 0.4)
        return
      case "undo":
        this.tone(260, 0.12, "triangle", 0.25)
        return
      case "restart":
        this.tone(220, 0.2, "triangle", 0.25)
        this.tone(165, 0.3, "triangle", 0.2, 0.08)
        return
      case "strike":
        this.click(120, 0.18, 0.9)
        this.noise(0.12, 0.35)
        return
      case "fire": {
        for (let i = 0; i < Math.min(cue.count, 4); i++) this.bell(cue.wave, 0.5, i * 0.035)
        if (cue.wasted > 0) this.noise(0.25, 0.3, 0.1)
        if (cue.shorted > 0) this.buzz(0.22, 0.1)
        return
      }
      case "solved":
        [0, 4, 7, 12].forEach((semitone, i) => this.tone(BASE * Math.pow(2, semitone / 12), 1.2, "sine", 0.22, i * 0.09))
        this.tone(BASE / 2, 1.8, "triangle", 0.12, 0.3)
        return
      case "failed":
        this.tone(110, 0.5, "sawtooth", 0.1)
        this.tone(104, 0.6, "sawtooth", 0.08, 0.05)
        return
      case "loaded":
        this.click(600, 0.05, 0.3)
        return
    }
  }

  private now(): number {
    return this.context?.currentTime ?? 0
  }

  private tone(frequency: number, duration: number, type: OscillatorType, gain: number, delay = 0): void {
    const context = this.context
    const master = this.master
    if (context === null || master === null) return
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    oscillator.type = type
    oscillator.frequency.value = frequency
    const start = this.now() + delay
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(gain, start + 0.01)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(envelope).connect(master)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.05)
  }

  /** A bell: a sine with a quick, brighter partial. */
  private bell(wave: number, gain: number, delay: number): void {
    const semitone = PENTATONIC[Math.min(wave, PENTATONIC.length - 1)] ?? 0
    const frequency = BASE * Math.pow(2, semitone / 12)
    this.tone(frequency, 0.9, "sine", gain * 0.5, delay)
    this.tone(frequency * 2.76, 0.25, "sine", gain * 0.12, delay)
  }

  private click(frequency: number, duration: number, gain: number): void {
    this.tone(frequency, duration, "square", gain * 0.12)
  }

  private noise(duration: number, gain: number, delay = 0): void {
    const context = this.context
    const master = this.master
    if (context === null || master === null) return
    const length = Math.floor(context.sampleRate * duration)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = context.createBufferSource()
    source.buffer = buffer
    const filter = context.createBiquadFilter()
    filter.type = "highpass"
    filter.frequency.value = 1800
    const envelope = context.createGain()
    envelope.gain.value = gain
    source.connect(filter).connect(envelope).connect(master)
    source.start(this.now() + delay)
  }

  private buzz(duration: number, delay: number): void {
    this.tone(70, duration, "sawtooth", 0.18, delay)
    this.tone(93, duration, "square", 0.08, delay)
  }
}
