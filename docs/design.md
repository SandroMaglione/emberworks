# Emberworks: design

A wordless puzzle game about waking a dormant machine, one chamber at a
time. Every chamber is a grid of brass relays. Each relay has arms
(strikers) pointing out of it, and pips: how many strikers must be aimed at
it before it fires. The player turns relays, then pulls the lever: the ember
fires, sparks race down its arms, the relays they strike fire in turn, and if
the player reasoned right the whole chamber lights up in one cascade.

## The one rule

Every cell must be struck exactly as many times as it has sockets, and the
sparks must get there. In full:

1. **No waste.** Every arm must point at a relay. A striker aimed at the frame
   or a hole throws its spark away. (The frame, holes, and the ember have no
   sockets.)
2. **Exact sockets.** A relay must be aimed at by exactly as many arms as it
   has sockets. A spark into a relay that already fired shorts it.
3. **Forward only.** A relay fires once every socket is filled. So a relay
   can never help fill the sockets of one that feeds it (that relay would
   sit half-charged forever), and relays only aimed at by each other, in an
   island no ember reaches, stay dark.

Rules 1 and 2 are local and countable, like Sudoku's rows and boxes: "this
2-socket relay already has two bolted strikers on it, so the elbow below must
face away", "the only two arms that can reach this lamp are these, so both
must". Rule 3 is the global check the firing makes visible: a half-charged
relay waiting for a spark it would have to send itself, or a dark island.

Chosen over the alternative (a relay fires on its first spark, later sparks
fill the remaining sockets) because it keeps the firing acyclic, which makes
far more chambers unique without bolting, and because the half-charged relay
is the clearest image of the one rule that counting alone cannot see.

## Why this, and not the alternatives

The roundtable (Opus, GPT 6.1 Sol, Luna, Haiku) unanimously rejected the
deterministic match-3 seed: cascades under gravity cannot be reasoned about,
and small boards with undo reward brute force. The strongest pitch was
Opus's "configure freely, then fire a cascade that proves you right": the
deduction is calm and Sudoku-like, the payoff is a Candy Crush cascade, and
the vehicle is a Machinarium contraption. Pure rotate-to-connect (Tatham's
Net) was judged too familiar, so the pips give it a counting dimension: every
relay carries its own number, and the sum of all pips equals the number of
arms on the board, a global invariant the player can lean on.

## What the player does

- **Tap** a relay: it turns a quarter clockwise with a mechanical tick.
- **Long-press / right-click** a relay: lock it (a pencil mark: "decided").
  A locked relay does not turn on a tap until unlocked.
- **Strike** (the lever, Space/Enter): the firing plays out to its end in a
  few seconds, every fault visible: a wasted spark fizzles against the
  frame, a short flashes jagged, half-charged relays glow half, dark relays
  stay dark. The result holds until the player taps; the relays at fault
  keep a faint scorch mark until they are turned. Nothing is lost.
- **Undo** (U) one turn at a time, **Restart** (R) the chamber.
- Sockets fill live as arms aim at them (bookkeeping, not judgment: an
  over-aimed relay shows a jagged mark, nothing ever turns green, and the
  forward-only rule stays invisible until the strike).

No timers, no lives, no move limits, no randomness.

## Pieces

| Piece | Arms | Notes |
|---|---|---|
| Ember | any | 0 pips; lights itself when the lever is pulled. Nothing may aim at it. |
| Relay | 1 to 4 arms: single, straight, elbow, tee, cross | 1 to 3 pips |
| Lamp | none | only takes sparks; the dead end that teaches "no waste" |
| Bolted relay | any | cannot be turned: a given |
| Hole | | an empty cell; arms aimed at it are wasted |

## Progression: 24 chambers in four rooms

Linear unlock. Each room is a part of the works with its own palette; the
last chamber of a room wakes that part of the machine on the room map.

1. **The Lamp Room** (6): the lever, no waste, sockets, a two-socket relay
   by the third chamber, the half-charged decoy, the dark island. The
   tutorial is the level design, starting with the lever itself: chamber
   one is an ember aimed at the frame, and the first pull fizzles.
2. **The Boiler** (6): tees, more two-socket relays, chains that must be
   entered through one door, and the first cut counts.
3. **The Gallery** (6): bolted givens and holes that shape the chamber,
   then three-socket relays.
4. **The Flywheel** (6): two embers, 6x6 and 7x7, the hardest counting.

One verb throughout: no long arms, no new pieces. Crosses are drawn as fixed
hubs. Every chamber is checked by a solver for exactly one solution; the
generator also measures what a chamber asks of the player (how much the
sockets alone decide, whether the forward-only rule is needed) and chambers
are curated by that, not by size.

## Look and feel

A dark slate chamber framed in riveted brass. Relays are flat brass discs
with rounded arms ending in a small striker head; pips are small dots on the
disc. The ember breathes orange. Turning snaps with an overshoot. On a
strike, a white-hot dot races along each arm, each struck relay flares and
rings outward, and a synthesised tick rises in pitch with each wave of the
cascade. A solved chamber hums, and the lever stays down.

## Second round decisions

Opus and GPT 6.1 Sol reviewed the first draft. Taken: fire-when-full
semantics made explicit (Sol found the ambiguity; Opus's chamber four
teaches it); a two-socket relay by chamber three, so the first room is not
Tatham's Net; play the whole firing, hold it until dismissed, scorch marks
after; no long arms; crosses drawn as fixed hubs; 24 strong chambers over 32;
the win carries a spark out of the chamber into the works, and the room map
is one machine that each solved chamber visibly restores. Split: live socket
fill (Opus for, Sol against). Taken as bookkeeping, since the deduction the
game is about (forward only, islands) stays hidden until the strike. Dropped:
the clean-strike award, which graded the player for not using the lever.

## Playtests (reasoning on paper)

Three models solved chambers from a text description, with the rules
stated and no cascade to watch.

- **Haiku (a fresh player's proxy), chambers 2 to 6.** Solved all five with
  no guess. Clarity 4/5 for "Pass It On", "Two Sockets" and "Two to Fire"
  (the half-charged trap reads), 3/5 for "The Only Door" (dark relays read
  as failure, but tracing a six-cell chain is work), 2/5 for the sixth: the
  jump from 6 relays to 14 with new shapes and two-socket collectors at once
  was too big. Taken: a small chamber with an elbow and a two-socket relay
  before the first 4x4.
- **Luna, the mid chambers.** Could not finish on paper and said so; its
  partial chain was right. Its suggestion, a visible mark on relays already
  guaranteed a spark, is what the live socket fill does on the board.
- **Opus, chambers 15 and 22.** Solved both with no hypothesis; every
  chamber had exactly one step where the forward-only rule decided (the
  half-charge swap), and named the best moments as a player would: cut
  count, only door, half-charge trap, backward fuse trace. Verdict: 2 to
  2.5 out of 5 deduction versus bookkeeping; the difficulty came from size,
  not depth, and two embers that never meet are two puzzles stapled
  together.

Taken from Opus, as measures the generator now reports and filters on:

- **Trivial ratio:** the share of turnable relays decided by the frame and
  "that neighbour is full" alone. At most 60% from the second room on.
- **Forward-rule necessity:** how many relays differ between a counting-only
  answer and the real one. At least 1 by the second room, 2 in the last.
- **Solver depth:** at least one hypothesis for the last chambers.
- **Ember coupling:** a two-ember chamber needs a relay both cascades reach.
- **Size:** at most 22 to 24 turnable relays, with holes and lamps as
  filler; shrink rather than grow when the measures are low.

## The chambers, after curation

Rooms two to four were regenerated under the measures above and chosen by
hand from the candidates: every chamber from the fourth on needs the
forward-only rule for at least two relays, no chamber past the first room
has more than 60% of its relays decided by the frame and full neighbours,
the two-ember chambers all share relays between the two cascades, and the
last room needs one or two hypotheses. The first room gained a 3x3 bridge
("Lantern": an elbow and a two-socket relay) before the rooms grow, as the
tutorial playtest asked. `node scripts/measure.ts` prints the measures of
every chamber in the game.

A second pass by Opus over the re-curated chambers rated them 3 and 3.5 out
of 5 (from 2 and 2.5): the forward-only rule now decides the opening and the
finish. Its remaining note, that each solve is one line of forced moves,
led to two more measures: the solver now reasons with the forward-only rule
itself (a relay that certainly feeds another can never be aimed at by it),
so its depth counts only what no rule decides, and `trace` shows the solve
round by round. The late rooms decide several relays per round (wide
fronts, not a single line), and chamber 23 is the one chamber past the
first room that the rules alone cannot finish: a ring that counts right and
would stay dark, the island deduction at full size.
