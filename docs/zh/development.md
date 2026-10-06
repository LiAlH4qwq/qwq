# 开发

完整规则见 [`AGENTS.md`](https://github.com/LiAlH4qwq/qwq/blob/main/AGENTS.md)，
以及 `packages/`、`nix/`、`docs/` 下各自的 AGENTS 文件。

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint + scripts/check-ast.ts + scripts/check-shell.ts
pnpm check:ast   # 仅 AST 级函数式规则
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + shell + test
pnpm build       # rolldown 打包（所有包）
pnpm build:gui   # 打包 Electron 图形前端
pnpm dev         # 从源码运行服务端
pnpm start <组件>  # server | cli | tui | voice | command | gui
```

`pnpm start` 从源码运行组件（`tsx`）；`gui` 会先构建再启动 Electron。不带组件名时启动
服务端。

## Git 工作流程

在新分支上工作，最终以单个提交合入 `main`。

```bash
git switch -c <分支>            # 从 main 拉出分支
# … 按需提交 WIP，然后
pnpm check                      # 合入前必须通过
git switch main
git pull --ff-only              # 保持 main 最新
git merge --squash <分支>        # 把整个分支作为一处改动暂存
git commit                      # 用一次提交描述整体改动
git branch -D <分支>            # 可选：删除已压缩的分支
```

`main` 保持线性（每次提交一个逻辑改动）；不要直接把功能工作提交到 `main`，也不要强制
推送或改写共享历史。版本仅在改动合入时递增，详见
[`AGENTS.md`](https://github.com/LiAlH4qwq/qwq/blob/main/AGENTS.md)。

## 强制的 AST 规则

`pnpm lint` 会运行 `scripts/check-ast.ts`（使用 TypeScript 编译器 API），在 `packages/`
（含 `packages/gui`）、`test/`、`scripts/` 下的 `.ts` 与 `.tsx` 文件中拒绝：

`var` / `let` / `using`、`while` / `do` / `for` / `for-in` / `for-of` / 标签 /
`break` / `continue`、`try` / `catch`、`throw`、`async` / `await`、
`Promise.then` / `Promise.finally`、`++` / `--`、`delete`、非空断言、
`Array.prototype.forEach`、可变数组方法（`push`、`pop`、`shift`、`unshift`、
`splice`、`sort`、`reverse`、`fill`、`copyWithin`）、`Object.assign` /
`defineProperty` / `setPrototypeOf` 与 `Reflect.*` 变更、对对象/数组成员的赋值、
`any` 关键字，以及 `as unknown as` 双重断言。

此外还拒绝弱值写法：`undefined` 字面量、可选链（`x?.y`）、空值合并（`x ?? y`），以及
产生非布尔值的短路回退（`x && y` / `x || y`）。请改用 `Option`、`Either`、`Effect`。
`&&` 与 `||` 作为纯布尔运算符仍然允许。

请改用 `const`、`Array.map` / `filter` / `reduce` / `flatMap`、`Effect.all`、
`Effect.try` / `Effect.tryPromise` 以及类型化错误。

## Shell 规则

禁止 bash；逻辑用 TypeScript 或 Nushell。`scripts/check-shell.ts` 会对任何 `.sh`、
`.bash`、`.bats` 文件或 bash/POSIX shebang 报错。

## `.github`

`.github/` 由 `nix/github.nix` 从 Nix 生成，请勿手改。

```bash
nix run .#write-github -- . --stage   # 重新生成并暂存
nix run .#check-github -- .           # 若过期则失败
```
