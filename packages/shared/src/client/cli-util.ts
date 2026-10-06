import { Effect, Option } from "effect"

export const write = (
  text: string,
  to: "stdout" | "stderr",
): Effect.Effect<void> =>
  Effect.sync(() => {
    const stream = to === "stdout" ? process.stdout : process.stderr
    stream.write(text)
  })

export const findConfigPath = (
  argv: ReadonlyArray<string>,
): Option.Option<string> => {
  const equals = Option.fromNullable(
    argv.find((arg) => arg.startsWith("--config=")),
  )
  if (Option.isSome(equals)) {
    return Option.some(equals.value.slice("--config=".length))
  }
  const index = argv.findIndex((arg) => arg === "--config" || arg === "-c")
  return index >= 0 ? Option.fromNullable(argv[index + 1]) : Option.none()
}

export const stripConfigArgs = (
  argv: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const indices = argv.flatMap((arg, index) =>
    arg === "--config" || arg === "-c"
      ? [index, index + 1]
      : arg.startsWith("--config=")
        ? [index]
        : [],
  )
  return argv.filter((_arg, index) => !indices.includes(index))
}

export const shellNameOf = (text: Option.Option<string>): string =>
  Option.getOrElse(text, () => "<unknown>").trim()

export const findValue = (
  argv: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
): Option.Option<string> => {
  const equals = Option.fromNullable(
    argv.find((arg) => names.some((name) => arg.startsWith(`${name}=`))),
  )
  if (Option.isSome(equals)) {
    const name = names.find((candidate) =>
      equals.value.startsWith(`${candidate}=`),
    )
    return Option.map(Option.fromNullable(name), (matched) =>
      equals.value.slice(matched.length + 1),
    )
  }
  const index = argv.findIndex((arg) => names.includes(arg))
  return index >= 0 ? Option.fromNullable(argv[index + 1]) : Option.none()
}

export const stripValue = (
  argv: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const indices = argv.flatMap((arg, index) =>
    names.includes(arg)
      ? [index, index + 1]
      : names.some((name) => arg.startsWith(`${name}=`))
        ? [index]
        : [],
  )
  return argv.filter((_arg, index) => !indices.includes(index))
}

export const findSessionArg = (
  argv: ReadonlyArray<string>,
): Option.Option<string> => findValue(argv, ["--session", "-s"])

export const stripSessionArg = (
  argv: ReadonlyArray<string>,
): ReadonlyArray<string> => stripValue(argv, ["--session", "-s"])

