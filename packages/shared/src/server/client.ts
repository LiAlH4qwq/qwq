import { NodeSocket } from "@effect/platform-node"
import { RpcClient, RpcSerialization, type RpcGroup } from "@effect/rpc"
import { Context, Effect, Fiber, Layer, Stream } from "effect"
import type { Session, SessionSummary } from "../domain/session"
import { RemoteAskError } from "../errors"
import { QwqRpcs, type AskInput, type QwqEvent } from "./rpc"

export interface ClientOptions {
  readonly host: string
  readonly port: number
}

const serverUrl = (options: ClientOptions): string =>
  `ws://${options.host}:${options.port}`

const hasMessage = (value: unknown): value is { readonly message: unknown } =>
  typeof value === "object" && value !== null && "message" in value

const messageOf = (error: unknown): string =>
  hasMessage(error) ? String(error.message) : String(error)

const remoteError = (error: unknown): RemoteAskError =>
  new RemoteAskError({ message: messageOf(error) })

export interface AskResult {
  readonly sessionId: string
  readonly answer: string
}

export interface QwqRpcClientShape {
  readonly ask: (input: AskInput) => Effect.Effect<AskResult, RemoteAskError>
  readonly subscribe: Stream.Stream<QwqEvent, RemoteAskError>
  readonly listSessions: Effect.Effect<
    ReadonlyArray<SessionSummary>,
    RemoteAskError
  >
  readonly getSession: (
    sessionId: string,
  ) => Effect.Effect<Session, RemoteAskError>
  readonly renameSession: (
    sessionId: string,
    title: string,
  ) => Effect.Effect<SessionSummary, RemoteAskError>
  readonly deleteSession: (
    sessionId: string,
  ) => Effect.Effect<{ readonly ok: boolean }, RemoteAskError>
  readonly respondPermission: (
    requestId: string,
    allow: boolean,
  ) => Effect.Effect<{ readonly ok: boolean }, RemoteAskError>
}

// The RPC client is a service so its WebSocket lives in the layer scope that
// owns it. Never build a client inside a function that returns a Stream: the
// scope would close before the stream is pulled (the `subscribeRemote` bug).
export class QwqRpcClient extends Context.Tag("qwq/QwqRpcClient")<
  QwqRpcClient,
  QwqRpcClientShape
>() {
  static readonly layerSocket = (
    options: ClientOptions,
  ): Layer.Layer<QwqRpcClient> => QwqRpcClient.layerSocketUrl(serverUrl(options))

  static readonly layerSocketUrl = (url: string): Layer.Layer<QwqRpcClient> =>
    Layer.scoped(QwqRpcClient, make).pipe(
      Layer.provide(RpcClient.layerProtocolSocket()),
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(NodeSocket.layerWebSocket(url)),
    )
}

// Turn an already-scoped `RpcClient` into the domain service shape. Tests build
// this from `RpcTest.makeClient`; production builds it from a socket.
export const fromRpcClient = <E>(
  client: RpcClient.RpcClient<RpcGroup.Rpcs<typeof QwqRpcs>, E>,
): QwqRpcClientShape => ({
  ask: (input) => client.Ask(input).pipe(Effect.mapError(remoteError)),
  subscribe: client.Subscribe({}).pipe(Stream.mapError(remoteError)),
  listSessions: client.ListSessions().pipe(Effect.mapError(remoteError)),
  getSession: (sessionId) =>
    client.GetSession({ sessionId }).pipe(Effect.mapError(remoteError)),
  renameSession: (sessionId, title) =>
    client
      .RenameSession({ sessionId, title })
      .pipe(Effect.mapError(remoteError)),
  deleteSession: (sessionId) =>
    client.DeleteSession({ sessionId }).pipe(Effect.mapError(remoteError)),
  respondPermission: (requestId, allow) =>
    client
      .RespondPermission({ requestId, allow })
      .pipe(Effect.mapError(remoteError)),
})

export const layerFromClient = <E>(
  client: RpcClient.RpcClient<RpcGroup.Rpcs<typeof QwqRpcs>, E>,
): Layer.Layer<QwqRpcClient> => Layer.succeed(QwqRpcClient, fromRpcClient(client))

const make = Effect.gen(function* () {
  const client = yield* RpcClient.make(QwqRpcs)
  return fromRpcClient(client)
})

export interface AskEventHandlers {
  readonly onDelta: (text: string) => Effect.Effect<void>
  readonly onTool: (
    name: string,
    detail: string,
    phase: "start" | "result",
  ) => Effect.Effect<void>
  readonly onPermission: (request: {
    readonly requestId: string
    readonly tool: string
    readonly detail: string
  }) => Effect.Effect<void>
}

// Run an `Ask` while forwarding events for the same origin. Events are matched
// by origin rather than session id because a brand-new session's id is only
// known once the server answers.
export const askWithEvents = (
  input: AskInput,
  handlers: AskEventHandlers,
): Effect.Effect<AskResult, RemoteAskError, QwqRpcClient> =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* QwqRpcClient
      const subscription = yield* client.subscribe.pipe(
        Stream.runForEach((event) => {
          if (event._tag === "Delta" && event.origin === input.origin) {
            return handlers.onDelta(event.content)
          }
          if (event._tag === "Tool" && event.origin === input.origin) {
            return handlers.onTool(event.name, event.detail, event.phase)
          }
          if (event._tag === "Permission" && event.origin === input.origin) {
            return handlers.onPermission({
              requestId: event.requestId,
              tool: event.tool,
              detail: event.detail,
            })
          }
          return Effect.void
        }),
        Effect.catchTag("RemoteAskError", (error: RemoteAskError) =>
          Effect.logWarning(`事件订阅失败：${error.message}`),
        ),
        Effect.forkScoped,
      )
      const result = yield* client.ask(input)
      yield* Fiber.interrupt(subscription)
      return result
    }),
  )
