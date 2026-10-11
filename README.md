# Logout

A fitness log you type into. Pick Strength, Cardio or Food, write what you did the way you'd say it
(`bench press 3x8 60kg @8`, `easy run 8km 46:30`, `chicken breast 200g 330kcal 62p 0c 7f`), and Logout reads it.

- **Text is the record.** Only what was typed is kept, and it is never rewritten. Everything shown is worked out
  from the text, so one change can move other entries' numbers.
- **No questions.** Fixed rules read each line, and colour shows how it was read.
- **All parsing on the device.** The server only stores and sends entries.

## Repository

| Path              | What it is                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| `packages/engine` | `@logout/engine`: the log engine. Pure TypeScript with no DOM, storage or clock. |
| `packages/sample` | `@logout/sample`: a seeded sample history for demos. It is never synced.         |

## Getting started

Requires Node 22.17+ (see `.nvmrc`) and pnpm 11.

```sh
pnpm install
pnpm test     # every package's tests
pnpm check    # type checks
pnpm lint     # eslint + prettier
```

## The engine

An entry is one LOG press: `{ id, date, time, mode, text, units }`. `build(entries, { today, profile, aliases })`
reads every entry in two passes, oldest first:

1. the newest line that states an item's values sets its card (one set of values per kind of amount);
2. every line resolves against the cards, and the results add up per day.

`packages/engine/test/engine.test.ts` is the grammar, by example. `parity.test.ts` checks the engine against the
original reference implementation (`test/legacy/`) over the full sample history, day by day.
