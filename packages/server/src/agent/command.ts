import { Option } from "effect"
import {
  commandBeginMarker,
  commandEndMarker,
  terminateMarker,
  terminateMessage,
} from "@qwq/shared/domain/markers"

export const hasCommand = (text: string): boolean => {
  const begin = text.lastIndexOf(commandBeginMarker)
  const end = text.lastIndexOf(commandEndMarker)
  return begin !== -1 && end !== -1 && begin < end
}

export const extractText = (answer: string): string =>
  hasCommand(answer)
    ? answer
        .split(commandBeginMarker)
        .slice(0, -1)
        .join(commandBeginMarker)
        .trim()
    : answer.trim()

export const extractCommand = (answer: string): string => {
  if (!hasCommand(answer)) {
    return ""
  }
  const afterBegin = Option.fromNullable(answer.split(commandBeginMarker).at(-1))
  return Option.getOrElse(
    Option.flatMap(afterBegin, (segment) =>
      Option.fromNullable(segment.split(commandEndMarker).at(0)),
    ),
    () => "",
  ).trim()
}

export const processAnswer = (text: string): string => {
  const trimmed = text.trim()
  return trimmed.startsWith(terminateMarker) ||
    trimmed.endsWith(terminateMarker)
    ? terminateMessage
    : trimmed
}
