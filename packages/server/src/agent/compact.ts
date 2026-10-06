import type { HttpClient } from "@effect/platform"
import { Effect, Option } from "effect"
import { resolveApiKey } from "@qwq/shared/config/load"
import type { Config } from "@qwq/shared/config/schema"
import type { Message } from "@qwq/shared/domain/message"
import { characterCount } from "@qwq/shared/domain/session"
import type { ApiKeyError, LlmRequestError, LlmResponseError } from "@qwq/shared/errors"
import { complete } from "../llm/client"
import type { LlmMessage } from "../llm/types"

export type CompactError = ApiKeyError | LlmRequestError | LlmResponseError

const renderMessage = (message: Message): string => {
  const speaker =
    message.role === "user"
      ? "用户"
      : message.role === "assistant"
        ? "助手"
        : message.role === "tool"
          ? "工具"
          : "系统"
  return `${speaker}：${message.content}`
}

const summarize = (
  config: Config,
  older: ReadonlyArray<Message>,
): Effect.Effect<string, CompactError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const apiKey = yield* resolveApiKey(config.api)
    const messages: ReadonlyArray<LlmMessage> = [
      {
        role: "system",
        content:
          "你是一个对话摘要助手。请把下面较早的对话压缩成简洁的中文要点，" +
          "保留关键事实、决定与未完成的事项，省略寒暄。只输出摘要正文。",
      },
      { role: "user", content: older.map(renderMessage).join("\n") },
    ]
    const result = yield* complete(config.api, apiKey, messages)
    return result.text.trim()
  })

// Auto-compaction: when the working transcript exceeds the configured budget,
// replace the older messages with a model-written summary. Compaction never
// fails the request; on error it falls back to a plain note.
export const compactHistory = (
  config: Config,
  history: ReadonlyArray<Message>,
): Effect.Effect<ReadonlyArray<Message>, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const { compact } = config.sessions
    if (!compact.enable || characterCount(history) <= compact.maxChars) {
      return history
    }
    if (history.length <= compact.keepRecent) {
      return history
    }
    const keep = compact.keepRecent
    const older = history.slice(0, history.length - keep)
    const recent = history.slice(history.length - keep)
    const summary = yield* summarize(config, older).pipe(
      Effect.tapError(() =>
        Effect.logWarning("自动压缩失败，已改用截断保留最近对话"),
      ),
      Effect.match({
        onFailure: () => Option.none<string>(),
        onSuccess: (value) => Option.some(value),
      }),
    )
    const body = Option.getOrElse(
      summary,
      () => "（较早的对话因超出上下文长度已被省略）",
    )
    return [
      { role: "system", content: `以下是较早对话的摘要：\n${body}` },
      ...recent,
    ]
  })
