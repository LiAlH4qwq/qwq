import { Command, FileSystem, HttpClient } from "@effect/platform"
import type { CommandExecutor } from "@effect/platform"
import { Effect, Option, Schema } from "effect"
import type { ToolsConfig } from "@qwq/shared/config/schema"
import { ToolError } from "@qwq/shared/errors"
import { formatParseError } from "@qwq/shared/parse"
import type { ToolSpec } from "../llm/types"

export interface ToolDefinition {
  readonly spec: ToolSpec
  readonly run: (
    args: unknown,
  ) => Effect.Effect<
    string,
    ToolError,
    FileSystem.FileSystem | CommandExecutor.CommandExecutor | HttpClient.HttpClient
  >
  // Present when the tool may need explicit user approval before running.
  // `Some(detail)` means a review prompt is required; `None` means no review.
  readonly review?: (
    args: unknown,
  ) => Effect.Effect<Option.Option<string>, ToolError>
}

const valueOr = <A>(value: A | undefined, fallback: A): A =>
  Option.getOrElse(Option.fromNullable(value), () => fallback)

const nonEmpty = (value: string): Option.Option<string> =>
  value === "" ? Option.none() : Option.some(value)

const truncate = (text: string, maxBytes: number): string =>
  text.length <= maxBytes
    ? text
    : `${text.slice(0, maxBytes)}\n…[已截断 ${text.length - maxBytes} 字符]`

const workingDirOf = (config: ToolsConfig): string =>
  Option.getOrElse(nonEmpty(config.workingDir), () => process.cwd())

const resolvePath = (config: ToolsConfig, path: string): string =>
  path.startsWith("/") ? path : `${workingDirOf(config)}/${path}`

const shellOf = (config: ToolsConfig): string =>
  Option.getOrElse(nonEmpty(config.shell), () => "bash")

/* ------------------------------------------------------------------ */
/* command policy                                                      */
/* ------------------------------------------------------------------ */

const defaultBlacklist: ReadonlyArray<string> = [
  "rm\\s+-[a-z]*r[a-z]*f[a-z]*\\s+/(\\s|$)",
  "\\bsudo\\b",
  "\\bmkfs(\\.[a-z0-9]+)?\\b",
  "\\bdd\\b[^\\n]*of=/dev/",
  "\\b(shutdown|reboot|poweroff|halt)\\b",
  "(curl|wget)[^|\\n]*\\|\\s*(ba|z|da)?sh",
  "\\bchmod\\s+-R\\s+777\\s+/",
  ":\\(\\)\\s*\\{",
  ">\\s*/dev/[sh]d[a-z]",
]

const safeRegExp = (
  pattern: string,
): Effect.Effect<Option.Option<RegExp>> =>
  Effect.try({
    try: () => new RegExp(pattern),
    catch: () => "invalid" as const,
  }).pipe(
    Effect.map(Option.some),
    Effect.orElseSucceed(() => Option.none()),
  )

export const commandDenyReason = (
  config: ToolsConfig,
  command: string,
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const patterns = [...defaultBlacklist, ...config.blacklist]
    const tested = yield* Effect.all(patterns.map((pattern) =>
      safeRegExp(pattern).pipe(
        Effect.map((regex) =>
          Option.match(regex, {
            onNone: () => Option.none<string>(),
            onSome: (value) =>
              value.test(command) ? Option.some(pattern) : Option.none(),
          }),
        ),
      ),
    ))
    return tested.reduce<Option.Option<string>>(
      (acc, item) => (Option.isSome(acc) ? acc : item),
      Option.none(),
    )
  })

const matchesAny = (
  patterns: ReadonlyArray<string>,
  text: string,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const tested = yield* Effect.all(
      patterns.map((pattern) =>
        safeRegExp(pattern).pipe(
          Effect.map((regex) =>
            Option.match(regex, {
              onNone: () => false,
              onSome: (value) => value.test(text),
            }),
          ),
        ),
      ),
    )
    return tested.some((matched) => matched)
  })

// Whether a bash invocation needs an approval prompt (`Some(command)`), given
// the configured permission mode and allowlist. Hard denials are handled
// separately by `commandDenyReason`; automatic mode never prompts.
export const commandReviewReason = (
  config: ToolsConfig,
  command: string,
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    if (config.permission.mode === "auto") {
      return Option.none<string>()
    }
    const allowed = yield* matchesAny(config.permission.allow, command)
    return allowed ? Option.none<string>() : Option.some(command)
  })

/* ------------------------------------------------------------------ */
/* arg decoding                                                        */
/* ------------------------------------------------------------------ */

const decodeArgs =
  <A, I>(tool: string, schema: Schema.Schema<A, I>) =>
  (args: unknown): Effect.Effect<A, ToolError> =>
    Schema.decodeUnknown(schema)(args).pipe(
      Effect.mapError(
        (error) =>
          new ToolError({
            tool,
            message: `参数无效：${formatParseError(error).join("; ")}`,
            cause: error,
          }),
      ),
    )

const BashArgs = Schema.Struct({
  command: Schema.NonEmptyString,
  timeoutMs: Schema.optional(Schema.Int.pipe(Schema.greaterThan(0))),
})
const ReadArgs = Schema.Struct({
  filePath: Schema.NonEmptyString,
  offset: Schema.optional(Schema.Int.pipe(Schema.greaterThanOrEqualTo(0))),
  limit: Schema.optional(Schema.Int.pipe(Schema.greaterThan(0))),
})
const WriteArgs = Schema.Struct({
  filePath: Schema.NonEmptyString,
  content: Schema.String,
})
const EditArgs = Schema.Struct({
  filePath: Schema.NonEmptyString,
  oldString: Schema.NonEmptyString,
  newString: Schema.String,
})
const ListArgs = Schema.Struct({ path: Schema.optional(Schema.String) })
const GlobArgs = Schema.Struct({
  pattern: Schema.NonEmptyString,
  path: Schema.optional(Schema.String),
})
const GrepArgs = Schema.Struct({
  pattern: Schema.NonEmptyString,
  path: Schema.optional(Schema.String),
  include: Schema.optional(Schema.String),
})
const WebfetchArgs = Schema.Struct({ url: Schema.NonEmptyString })

/* ------------------------------------------------------------------ */
/* filesystem helpers                                                  */
/* ------------------------------------------------------------------ */

const skipped = new Set(["node_modules", ".git", "dist", "result", ".direnv"])

const walk = (
  dir: string,
  depth: number,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    if (depth > 8) {
      return [] as ReadonlyArray<string>
    }
    const entries = yield* fs
      .readDirectory(dir)
      .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>))
    const nested = yield* Effect.all(entries.map((entry) =>
      Effect.gen(function* () {
        if (skipped.has(entry)) {
          return [] as ReadonlyArray<string>
        }
        const full = `${dir}/${entry}`
        const info = yield* Effect.option(fs.stat(full))
        if (Option.isNone(info)) {
          return [] as ReadonlyArray<string>
        }
        if (info.value.type === "Directory") {
          return yield* walk(full, depth + 1)
        }
        return [full] as ReadonlyArray<string>
      }),
    ))
    return nested.flat()
  })

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  const expanded = escaped
    .replaceAll("**", "§")
    .replaceAll("*", "[^/]*")
    .replaceAll("§", ".*")
    .replaceAll("?", "[^/]")
  return new RegExp(`^${expanded}$`)
}

const fileError = (tool: string, message: string) => (cause: unknown) =>
  new ToolError({ tool, message, cause })

/* ------------------------------------------------------------------ */
/* definitions                                                         */
/* ------------------------------------------------------------------ */

export const definitions = (
  config: ToolsConfig,
): ReadonlyArray<ToolDefinition> => [
  {
    spec: {
      name: "bash",
      description:
        "在本机执行一条 shell 命令并返回 stdout/stderr。用于查询系统、运行程序等；危险命令会被拒绝。",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "要执行的命令" },
          timeoutMs: { type: "integer", description: "超时毫秒数（可选）" },
        },
        required: ["command"],
      },
    },
    review: (args) =>
      Effect.gen(function* () {
        const parsed = yield* decodeArgs("bash", BashArgs)(args)
        return yield* commandReviewReason(config, parsed.command)
      }),
    run: (args) =>
      Effect.gen(function* () {
        const parsed = yield* decodeArgs("bash", BashArgs)(args)
        const denied = yield* commandDenyReason(config, parsed.command)
        if (Option.isSome(denied)) {
          return yield* Effect.fail(
            new ToolError({
              tool: "bash",
              message: `命令被安全策略拒绝（匹配 ${denied.value}）`,
              cause: denied.value,
              denied: true,
            }),
          )
        }
        const timeout = valueOr(parsed.timeoutMs, config.timeoutMs)
        const output = yield* Command.string(
          Command.make(
            shellOf(config),
            "-lc",
            `${parsed.command} 2>&1`,
          ),
        ).pipe(
          Effect.timeout(timeout),
          Effect.mapError(fileError("bash", "命令执行失败")),
        )
        return truncate(output, config.maxOutputBytes)
      }),
  },
  {
    spec: {
      name: "read",
      description: "读取文本文件内容，可选 offset（起始行）与 limit（行数）。",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          offset: { type: "integer" },
          limit: { type: "integer" },
        },
        required: ["filePath"],
      },
    },
    run: (args) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const parsed = yield* decodeArgs("read", ReadArgs)(args)
        const content = yield* fs
          .readFileString(resolvePath(config, parsed.filePath))
          .pipe(Effect.mapError(fileError("read", "读取失败")))
        const lines = content.split("\n")
        const offset = valueOr(parsed.offset, 0)
        const limit = valueOr(parsed.limit, lines.length)
        return truncate(
          lines.slice(offset, offset + limit).join("\n"),
          config.maxOutputBytes,
        )
      }),
  },
  {
    spec: {
      name: "write",
      description: "把内容写入文件（覆盖），必要时创建父目录。",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          content: { type: "string" },
        },
        required: ["filePath", "content"],
      },
    },
    run: (args) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const parsed = yield* decodeArgs("write", WriteArgs)(args)
        const path = resolvePath(config, parsed.filePath)
        const dir = path.slice(0, path.lastIndexOf("/"))
        if (dir !== "") {
          yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.ignore)
        }
        yield* fs
          .writeFileString(path, parsed.content)
          .pipe(Effect.mapError(fileError("write", "写入失败")))
        return `已写入 ${path}（${parsed.content.length} 字符）`
      }),
  },
  {
    spec: {
      name: "edit",
      description: "把文件中的 oldString 首次出现替换为 newString。",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          oldString: { type: "string" },
          newString: { type: "string" },
        },
        required: ["filePath", "oldString", "newString"],
      },
    },
    run: (args) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const parsed = yield* decodeArgs("edit", EditArgs)(args)
        const path = resolvePath(config, parsed.filePath)
        const content = yield* fs
          .readFileString(path)
          .pipe(Effect.mapError(fileError("edit", "读取失败")))
        if (!content.includes(parsed.oldString)) {
          return yield* Effect.fail(
            new ToolError({
              tool: "edit",
              message: "未找到 oldString",
              cause: parsed.oldString,
            }),
          )
        }
        const updated = content.replace(
          parsed.oldString,
          () => parsed.newString,
        )
        yield* fs
          .writeFileString(path, updated)
          .pipe(Effect.mapError(fileError("edit", "写入失败")))
        return `已修改 ${path}`
      }),
  },
  {
    spec: {
      name: "list",
      description: "列出目录下的条目。",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: [],
      },
    },
    run: (args) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const parsed = yield* decodeArgs("list", ListArgs)(args)
        const dir = resolvePath(config, valueOr(parsed.path, "."))
        const entries = yield* fs
          .readDirectory(dir)
          .pipe(Effect.mapError(fileError("list", "读取目录失败")))
        return truncate([...entries].toSorted().join("\n"), config.maxOutputBytes)
      }),
  },
  {
    spec: {
      name: "glob",
      description: "按 glob 模式（如 **/*.ts）在目录下递归查找文件。",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
        },
        required: ["pattern"],
      },
    },
    run: (args) =>
      Effect.gen(function* () {
        const parsed = yield* decodeArgs("glob", GlobArgs)(args)
        const root = resolvePath(config, valueOr(parsed.path, "."))
        const files = yield* walk(root, 0)
        const regex = globToRegExp(parsed.pattern)
        const matches = files
          .filter((file) => regex.test(file.slice(root.length + 1)))
          .toSorted()
        return truncate(matches.join("\n"), config.maxOutputBytes)
      }),
  },
  {
    spec: {
      name: "grep",
      description: "用正则表达式递归搜索文件内容，返回匹配的行。",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
          include: { type: "string", description: "文件名 glob，如 *.ts" },
        },
        required: ["pattern"],
      },
    },
    run: (args) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const parsed = yield* decodeArgs("grep", GrepArgs)(args)
        const regex = yield* safeRegExp(parsed.pattern).pipe(
          Effect.flatMap((option) =>
            Option.match(option, {
              onNone: () =>
                Effect.fail(
                  new ToolError({
                    tool: "grep",
                    message: "正则表达式无效",
                    cause: parsed.pattern,
                  }),
                ),
              onSome: (value) => Effect.succeed(value),
            }),
          ),
        )
        const root = resolvePath(config, valueOr(parsed.path, "."))
        const includeRegex = Option.map(
          Option.fromNullable(parsed.include),
          globToRegExp,
        )
        const files = yield* walk(root, 0)
        const matches = yield* Effect.all(files.map((file) => {
          const basename = file.slice(file.lastIndexOf("/") + 1)
          if (
            Option.isSome(includeRegex) &&
            !includeRegex.value.test(basename)
          ) {
            return Effect.succeed([] as ReadonlyArray<string>)
          }
          return Effect.gen(function* () {
            const content = yield* fs
              .readFileString(file)
              .pipe(Effect.orElseSucceed(() => ""))
            return content
              .split("\n")
              .flatMap((line, index) =>
                regex.test(line) ? [`${file}:${index + 1}:${line}`] : [],
              )
          })
        }))
        return truncate(matches.flat().join("\n"), config.maxOutputBytes)
      }),
  },
  {
    spec: {
      name: "webfetch",
      description: "抓取一个 URL 的文本内容。",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
    run: (args) =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const parsed = yield* decodeArgs("webfetch", WebfetchArgs)(args)
        const response = yield* client
          .get(parsed.url)
          .pipe(Effect.mapError(fileError("webfetch", "请求失败")))
        const text = yield* response.text.pipe(
          Effect.mapError(fileError("webfetch", "读取失败")),
        )
        return truncate(text, config.maxOutputBytes)
      }),
  },
]
