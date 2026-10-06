import { FileSystem } from "@effect/platform"
import { Effect, Option, Schema } from "effect"
import { parse as parseYaml } from "yaml"
import {
  ApiKeyError,
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
} from "../errors"
import { formatParseError } from "../parse"
import { Config, type ApiConfig } from "./schema"

export const decodeConfig = (
  parsed: unknown,
  path: string,
): Effect.Effect<Config, ConfigParseError> =>
  Schema.decodeUnknown(Config, { errors: "all" })(parsed).pipe(
    Effect.mapError(
      (error) => new ConfigParseError({ path, issues: formatParseError(error) }),
    ),
  )

export const validateConfig = (
  config: Config,
): Effect.Effect<Config, ConfigValidationError> => {
  const issues = Option.isSome(Option.fromNullable(config.api.key))
    ? []
    : Option.isSome(Option.fromNullable(config.api.keyEnv))
      ? []
      : ["api: either `key` or `keyEnv` must be set"]
  return issues.length > 0
    ? Effect.fail(new ConfigValidationError({ issues }))
    : Effect.succeed(config)
}

export const loadConfig = (
  path: string,
): Effect.Effect<
  Config,
  ConfigReadError | ConfigParseError | ConfigValidationError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const content = yield* fs
      .readFileString(path)
      .pipe(Effect.mapError((cause) => new ConfigReadError({ path, cause })))
    const parsed = yield* Effect.try({
      try: () => parseYaml(content),
      catch: (cause) =>
        new ConfigParseError({ path, issues: [String(cause)] }),
    })
    const config = yield* decodeConfig(parsed, path)
    return yield* validateConfig(config)
  })

export const resolveApiKey = (
  api: ApiConfig,
): Effect.Effect<string, ApiKeyError> => {
  const direct = Option.fromNullable(api.key)
  if (Option.isSome(direct)) {
    return Effect.succeed(direct.value)
  }
  const envName = Option.fromNullable(api.keyEnv)
  if (Option.isNone(envName)) {
    return Effect.fail(new ApiKeyError({ envVar: "" }))
  }
  return Effect.sync(() => process.env[envName.value]).pipe(
    Effect.flatMap((value) =>
      Option.match(Option.fromNullable(value), {
        onNone: () => Effect.fail(new ApiKeyError({ envVar: envName.value })),
        onSome: (key) => Effect.succeed(key),
      }),
    ),
  )
}
