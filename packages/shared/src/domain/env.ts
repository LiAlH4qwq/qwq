import { Option } from "effect"

export interface EnvVar {
  readonly name: string
  readonly value: string
}

export const getEnvVars = (
  names: ReadonlyArray<string>,
): ReadonlyArray<EnvVar> =>
  names.map((name) => ({
    name,
    value: Option.getOrElse(
      Option.fromNullable(process.env[name]),
      () => "<unset>",
    ),
  }))
