/**
 * A tiny Standard Schema for the plain values the game saves in its state
 * machine: the game brings its own schemas, and these are small enough to
 * write by hand.
 */
import type { Descriptor } from "@typeonce/ritmo"

const isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> => typeof raw === "object" && raw !== null

const isCount = (raw: unknown): raw is number => typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0

/** An object whose listed fields are whole numbers, 0 or more. */
export const counts = <const Fields extends ReadonlyArray<string>>(
  ...fields: Fields
): Descriptor.StandardSchema<{ readonly [K in Fields[number]]: number }, { readonly [K in Fields[number]]: number }> => ({
  "~standard": {
    version: 1,
    vendor: "emberworks",
    validate: (raw) => {
      if (!isRecord(raw)) return { issues: [{ message: "expected an object" }] }
      const value: Record<string, number> = {}
      for (const field of fields) {
        const entry = raw[field]
        if (!isCount(entry)) return { issues: [{ message: `${field} must be a whole number, 0 or more`, path: [field] }] }
        value[field] = entry
      }
      return { value: value as { readonly [K in Fields[number]]: number } }
    }
  }
})
