import { Option, Schema } from "effect"
import { Message } from "./message"

export const Origin = Schema.Literal("command", "voice", "cli", "tui", "gui")
export type Origin = typeof Origin.Type

export const Session = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  origin: Origin,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  // For voice sessions this is the moment the "voice session" marking expires
  // and the session becomes a normal one. `0` means no marking.
  voiceExpiresAt: Schema.Number,
  messages: Schema.Array(Message),
})
export type Session = typeof Session.Type

export const SessionSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  origin: Origin,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  voiceExpiresAt: Schema.Number,
  messageCount: Schema.Int,
})
export type SessionSummary = typeof SessionSummary.Type

export const summarize = (session: Session): SessionSummary => ({
  id: session.id,
  title: session.title,
  origin: session.origin,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  voiceExpiresAt: session.voiceExpiresAt,
  messageCount: session.messages.length,
})

export const capabilityOf = (
  origin: Origin,
): "command" | "voice" | "chat" =>
  origin === "command" ? "command" : origin === "voice" ? "voice" : "chat"

export const originLabel = (origin: Origin): string => {
  switch (origin) {
    case "command":
      return "命令补全"
    case "voice":
      return "语音"
    case "cli":
      return "命令行"
    case "tui":
      return "终端"
    case "gui":
      return "图形界面"
  }
}

export const isVoiceActive = (
  session: Pick<SessionSummary, "origin" | "voiceExpiresAt">,
  now: number,
): boolean => session.origin === "voice" && session.voiceExpiresAt > now

const pad = (value: number): string =>
  value < 10 ? `0${value}` : String(value)

export const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const timeTitle = (origin: Origin, at: number): string =>
  `${originLabel(origin)}：${formatTime(at)}`

export const topicTitle = (origin: Origin, topic: string): string =>
  `${originLabel(origin)}：${topic}`

const collapse = (text: string): string =>
  text.replace(/\s+/g, " ").trim()

export const fallbackTopic = (
  question: string,
  maxChars: number,
): Option.Option<string> => {
  const clean = collapse(question).replace(/^[「“"'《【(（]+|[」”"'》】)）]+$/g, "")
  if (clean === "") {
    return Option.none()
  }
  return Option.some(
    clean.length > maxChars ? `${clean.slice(0, maxChars)}…` : clean,
  )
}

export const cleanTopic = (
  raw: string,
  maxChars: number,
): Option.Option<string> => {
  const unquoted = collapse(raw).replace(
    /[「」“”"'‘’《》【】()（）]/g,
    "",
  )
  const clean = collapse(unquoted).replace(/[。．.!！?？，,、；;：:]+$/g, "")
  if (clean === "") {
    return Option.none()
  }
  return Option.some(
    clean.length > maxChars ? clean.slice(0, maxChars) : clean,
  )
}

export const characterCount = (
  messages: ReadonlyArray<Message>,
): number => messages.reduce((total, message) => total + message.content.length, 0)
