export interface Config {
    debug: boolean
    api: ConfigApi
    env_access: ConfigEnvAccess
}

export interface ConfigApi {
    type: "anthropic"
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
    role: "system" | "user"
    content: string
}

export interface ResponseResult {
    content: ResponseResultContent[]
}

export interface ResponseResultContent {
    type: "text"
    text: string
}