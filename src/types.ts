export interface Config {
    debug: boolean
    api: ConfigApi
    env_access: ConfigEnvAccess
}

export interface ConfigApi {
    type: "anthropic" | "openai"
    url: string
    key: string
    model: string
}

export interface ConfigEnvAccess {
    env_vars: string[]
}

export interface Request {
    method: "POST"
    headers: Headers
    body: string
}

export interface RequestBoby {
    model: string
    messages: Message[]
}

export interface Message {
    role: "system" | "user" | "assistant"
    content: string
}

export interface ResponseResultAnthropic {
    content: ResponseResultContentAnthropic[]
}

export interface ResponseResultContentAnthropic {
    type: "text"
    text: string
}

export interface ResponseResultOpenai {
    choices: ResponseResultChoiceOpenai[]
}

export interface ResponseResultChoiceOpenai {
    message: Message
}