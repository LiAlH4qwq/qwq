import { ParseResult } from "effect"

export const formatParseError = (
  error: ParseResult.ParseError,
): ReadonlyArray<string> =>
  ParseResult.ArrayFormatter.formatErrorSync(error).map((issue) => {
    const pathText = issue.path.join(".")
    return `${pathText === "" ? "<root>" : pathText}: ${issue.message}`
  })
