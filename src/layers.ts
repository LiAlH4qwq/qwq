import { Context, Effect, Layer } from "effect"
import { type RuntimeEnv, runtimeEnv } from "./env"

export interface FileSystem {
    readonly file: (path: string) => Bun.BunFile
    readonly write: (
        pathOrFile: string | Bun.BunFile,
        data: string,
    ) => Effect.Effect<number, never>
}

export interface HttpClient {
    readonly request: (
        url: string,
        data: RequestInit,
    ) => Effect.Effect<Response, unknown>
}

export class Runtime extends Context.Tag("qwq/Runtime")<
    Runtime,
    RuntimeEnv
>() {}
export class Files extends Context.Tag("qwq/Files")<Files, FileSystem>() {}
export class Http extends Context.Tag("qwq/Http")<Http, HttpClient>() {}

export const RuntimeLive = Layer.succeed(Runtime, runtimeEnv)
export const FilesLive = Layer.succeed(Files, {
    file: (path: string) => Bun.file(path),
    write: (pathOrFile, data) =>
        Effect.promise(() => Bun.write(pathOrFile, data)),
})
export const HttpLive = Layer.succeed(Http, {
    request: (url, data) => Effect.promise(() => fetch(url, data)),
})
export const AppLive = Layer.mergeAll(RuntimeLive, FilesLive, HttpLive)
