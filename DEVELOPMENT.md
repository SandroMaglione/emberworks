# Developing Emberworks

Emberworks is built on [`@typeonce/ritmo`](https://github.com/typeonce-dev/ritmo):
the rules are a headless, deterministic simulation, and the page is a host
over it.

```sh
pnpm install
pnpm dev --port 5260     # http://localhost:5260/
pnpm check               # typecheck, oxlint (ritmo rules), ritmo-devtools lint, tests
```

Add `?all` to the URL to open every chamber, and `?chamber=3-2` to jump to
one.

## How the code is organized

- `src/sim/`: the simulation. `rules.ts` is the machine as pure functions
  (arms, sockets, the firing). `solver.ts` solves a chamber with the rules a
  player uses, proves each has one answer, and measures how it plays.
  `levels.ts` is the content: 24 chambers in four rooms, written as text
  tokens (`*i00` an ember with one arm, `#L12` a bolted elbow with one
  socket, `o2` a lamp with two sockets, `..` a hole). `schema.ts` is the
  world (relays as entities, the chamber, the `Phase` state machine),
  `systems.ts` the intents and the firing's pacing, `view.ts` the one
  projection the host reads, `simulation.ts` the runtime and the schedule.
- `src/host/`: the page. `render.ts` draws the chamber with Pixi from the
  view, `hud.ts` and `shell.ts` are the DOM (the lever, the works),
  `audio.ts` synthesises every sound, `save.ts` keeps progress in local
  storage, `main.ts` wires the loop and turns the pointer and keys into
  intents.
- `test/`: headless tests of the content (uniqueness, balance, not solved at
  the start) and of play (intents, undo, locks, faults, the cascade,
  determinism).

The simulation imports no host code and no page API (`pnpm check` enforces
it). The host reads the world only through `ChamberInspector` and writes only
through `IntentEvent`.

## Making chambers

```sh
sh scripts/batch.sh                 # candidates for every room, into output/
node scripts/generate.ts --width 5 --height 5 --count 6 --seed 1   # flags are listed at the top of the file
node scripts/measure.ts             # the measures of every chamber in the game
node scripts/inspect.ts             # every chamber with its solution
node scripts/describe.ts 3-4        # a chamber as a player sees it, for a paper playtest
```

The generator builds a machine that fires right, scrambles it, and keeps it
when the solver finds exactly one answer. Chambers are then chosen by their
measures (see `docs/design.md`): how many relays the frame and full
neighbours decide alone, how many relays only the forward-only rule decides,
whether two embers' cascades meet, and the solve's shape round by round.

## Playing it in a browser

With the dev server running:

```sh
node scripts/autoplay.ts            # solves every chamber by tapping, checks it lights and saves
node scripts/interact.ts            # taps, holds, undo, faults on a phone-sized touch screen
node scripts/shots.ts 3-5 900x760   # screenshots of a chamber before, during and after a strike
node scripts/readme-shots.ts        # the README's screenshots, into output/readme
```

## Deploying

The game is deployed with [Alchemy](https://alchemy.run/) as a Cloudflare
Worker serving the Vite build. The separate `deploy/` package keeps its
dependencies out of the game, and Cloudflare stores the deployment state.
Progress stays in the player's browser.

```sh
pnpm install --frozen-lockfile
pnpm --dir deploy install --frozen-lockfile
pnpm --dir deploy exec alchemy plan --stage prod --profile admin --no-input
pnpm release --profile admin --yes --no-input
```

Release from an up-to-date `main`. The release command runs the game's check
and the deployment config's types, then Alchemy builds and deploys the game
to <https://emberworks.typeonce.dev>. Alchemy attaches that custom domain to
the `prod` Worker and creates its DNS record and certificate in the
`typeonce.dev` Cloudflare zone.

`admin` is the existing local Alchemy Cloudflare profile. On another machine,
use your own logged-in profile or set `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, then omit `--profile admin`. Keep credentials outside
the repository. Releases run locally; pushing to GitHub does not deploy.

For a temporary preview:

```sh
pnpm --dir deploy exec alchemy deploy --stage preview --profile admin
pnpm --dir deploy exec alchemy destroy --stage preview --profile admin
```

The second command removes the preview. Each stage has its own Worker;
previews stay on their `workers.dev` URL and never claim the custom domain.
