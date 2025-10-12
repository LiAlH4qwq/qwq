import * as S from "effect/Schema"

export interface Request {
    method: "POST"
    headers: RequestHead,
    body: string,
}

export interface RequestHead {
    Authorization: `Bearer ${string}`
    "Content-Type": "application/json"
}

export interface RequestBoby {
    model: string
    enable_thinking: false
    messages: Message[]
}

export type ConfigApiType = typeof ConfigApiTypeS.Type

export interface ConfigApi
    extends S.Schema.Type<typeof ConfigApiS> { }

export interface ConfigEnvAccess
    extends S.Schema.Type<typeof ConfigEnvAccessS> { }

export interface Config
    extends S.Schema.Type<typeof ConfigS> { }

export interface JsonlLine
    extends S.Schema.Type<typeof JsonlLineS> { }

export interface Message
    extends S.Schema.Type<typeof MessageS> { }

export interface ResponseResultContentAnthropic
    extends S.Schema<typeof ResponseResultContentAnthropicS> { }

export interface ResponseResultAnthropic
    extends S.Schema<typeof ResponseResultAnthropicS> { }

export interface ResponseResultChoiceOpenai
    extends S.Schema.Type<typeof ResponseResultChoiceOpenaiS> { }

export interface ResponseResultOpenai
    extends S.Schema.Type<typeof ResponseResultOpenaiS> { }

export const ConfigApiTypeS = S.Literal("anthropic", "openai")

export const ConfigApiS = S.Struct({
    type: ConfigApiTypeS,
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

export const JsonlLineS = S.Struct({
    messages: S.Array(MessageS)
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