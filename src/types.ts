import * as E from "effect/Either"
import * as S from "effect/Schema"

export type QwqAnyhowResult<T> = E.Either<T, QwqError>

export type QwqError = {
    stage: "AskingAi"
    category: "ApiConfigError"
    what: "UnknownApiType"
    details: string,
    raw: undefined
} | {
    stage: "ParsingResponse"
    category: "UnexepectedResponse"
    what: "UnknownResponseStructure"
    details: string
    raw: unknown
}

export interface ConfigApi
    extends S.Schema.Type<typeof ConfigApiS> { }

export interface ConfigEnvAccess
    extends S.Schema.Type<typeof ConfigEnvAccessS> { }

export interface Config
    extends S.Schema.Type<typeof ConfigS> { }

export interface Message
    extends S.Schema.Type<typeof MessageS> { }

export interface RequestBoby
    extends S.Schema.Type<typeof RequestBobyS> { }

export interface Request
    extends S.Schema.Type<typeof RequestS> { headers: Headers }

export interface ResponseResultContentAnthropic
    extends S.Schema<typeof ResponseResultContentAnthropicS> { }

export interface ResponseResultAnthropic
    extends S.Schema<typeof ResponseResultAnthropicS> { }

export interface ResponseResultChoiceOpenai
    extends S.Schema.Type<typeof ResponseResultChoiceOpenaiS> { }

export interface ResponseResultOpenai
    extends S.Schema.Type<typeof ResponseResultOpenaiS> { }

export const ConfigApiS = S.Struct({
    type: S.Literal("anthropic", "openai"),
    url: S.String,
    key: S.String,
    model: S.String,
})

export const ConfigEnvAccessS = S.Struct({
    env_vars: S.Array(S.String),
})

export const ConfigS = S.Struct({
    debug: S.Boolean,
    api: ConfigApiS,
    env_access: ConfigEnvAccessS,
})

export const MessageS = S.Struct({
    role: S.Literal("system", "assistant", "user"),
    content: S.String,
})

export const RequestBobyS = S.Struct({
    model: S.String,
    messages: S.Array(MessageS),
})

export const RequestS = S.Struct({
    method: S.Literal("POST"),
    headers: S.Object,
    body: S.String,
})

export const ResponseResultContentAnthropicS = S.Struct({
    type: S.Literal("text"),
    text: S.String,
})

export const ResponseResultAnthropicS = S.Struct({
    content: S.Array(ResponseResultContentAnthropicS),
})

export const ResponseResultChoiceOpenaiS = S.Struct({
    message: MessageS,
})

export const ResponseResultOpenaiS = S.Struct({
    choices: S.Array(ResponseResultChoiceOpenaiS),
})