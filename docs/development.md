# Development

See [`AGENTS.md`](https://github.com/LiAlH4qwq/qwq/blob/main/AGENTS.md) for the
full rules, and the per-tree files under `packages/`, `nix/` and `docs/`.

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint + scripts/check-ast.ts + scripts/check-shell.ts
pnpm check:ast   # AST-level functional-rule enforcement only
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + shell + test
pnpm build       # rolldown bundle (all packages)
pnpm build:gui   # bundle the Electron GUI
pnpm dev         # run the server from source
pnpm start <component>  # server | cli | tui | voice | command | gui
```

`pnpm start` runs a component from source (`tsx`); `gui` builds the renderer
first and then launches Electron. With no component it starts the server.

## Git workflow

Work on a branch and land on `main` as a single commit.

```bash
git switch -c <branch>          # branch off main
# … commit WIP as needed, then
pnpm check                      # must be green before landing
git switch main
git pull --ff-only              # keep main current
git merge --squash <branch>     # stage the branch as one change
git commit                      # one commit describing the whole change
git branch -D <branch>          # optional: drop the squashed branch
```

`main` stays linear (one logical change per commit); never commit feature work
directly to `main`, and do not force-push it or rewrite shared history. The
version is only bumped when the work lands, as described in
[`AGENTS.md`](https://github.com/LiAlH4qwq/qwq/blob/main/AGENTS.md).

## Enforced AST rules

`pnpm lint` runs `scripts/check-ast.ts` (TypeScript compiler API), which
rejects, in `.ts` and `.tsx` files under `packages/` (including `packages/gui`),
`test/` and `scripts/`:

`var` / `let` / `using`, `while` / `do` / `for` / `for-in` / `for-of` /
labels / `break` / `continue`, `try` / `catch`, `throw`, `async` / `await`,
`Promise.then` / `Promise.finally`, `++` / `--`, `delete`, non-null assertions,
`Array.prototype.forEach`, mutating array methods (`push`, `pop`, `shift`,
`unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`),
`Object.assign` / `defineProperty` / `setPrototypeOf` and `Reflect.*`
mutations, assignment to object or array members, the `any` keyword, and
`as unknown as` double assertions.

It additionally rejects the weak-value idioms: the `undefined` literal,
optional chaining (`x?.y`), nullish coalescing (`x ?? y`), and short-circuit
value fallbacks (`x && y` / `x || y` that produce a non-boolean value). Use
`Option`, `Either` and `Effect` instead. `&&` and `||` remain valid as pure
boolean operators.

Use `const`, `Array.map` / `filter` / `reduce` / `flatMap`, `Effect.all`,
`Effect.try` / `Effect.tryPromise`, and typed errors instead.

## Shell rule

Bash is banned; authored logic is TypeScript or Nushell.
`scripts/check-shell.ts` fails on any `.sh` / `.bash` / `.bats` file or
bash/POSIX shebang.

## `.github`

`.github/` is generated from Nix via `nix/github.nix`; do not hand-edit it.

```bash
nix run .#write-github -- . --stage   # regenerate and stage
nix run .#check-github -- .           # fail if stale
```
