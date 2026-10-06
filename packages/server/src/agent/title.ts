import type { HttpClient } from "@effect/platform"
import { Effect, type Option } from "effect"
import { resolveApiKey } from "@qwq/shared/config/load"
import type { Config } from "@qwq/shared/config/schema"
import { cleanTopic } from "@qwq/shared/domain/session"
import type { ApiKeyError, LlmRequestError, LlmResponseError } from "@qwq/shared/errors"
import { complete } from "../llm/client"
import type { LlmMessage } from "../llm/types"

export type TitleError = ApiKeyError | LlmRequestError | LlmResponseError

export const generateTopic = (
  config: Config,
  question: string,
): Effect.Effect<Option.Option<string>, TitleError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const apiKey = yield* resolveApiKey(config.api)
    const maxChars = config.sessions.title.maxChars
    const messages: ReadonlyArray<LlmMessage> = [
      {
        role: "system",
        content:
          `你是一个会话标题生成器。根据用户的第一句话，生成一个不超过 ${maxChars} 个字的简洁中文标题。` +
          "只输出标题本身，不要标点、引号、编号或任何解释。",
      },
      { role: "user", content: question },
    ]
    const result = yield* complete(config.api, apiKey, messages)
    return cleanTopic(result.text, maxChars)
  })
