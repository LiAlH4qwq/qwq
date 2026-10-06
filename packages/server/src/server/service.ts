import { NodeSocketServer } from "@effect/platform-node"
import { RpcSerialization, RpcServer } from "@effect/rpc"
import { Effect, Layer, Option, Stream } from "effect"
import { formatDiagnostic } from "@qwq/shared/diagnostics"
import { capabilityOf, summarize } from "@qwq/shared/domain/session"
import { version } from "@qwq/shared/version"
import { EventBus, layer as eventBusLayer } from "./events"
import { PermissionBroker, layer as permissionBrokerLayer } from "./permissions"
import { SessionStore } from "./sessions"
import { QwqRpcs } from "@qwq/shared/server/rpc"

export interface ServerOptions {
  readonly host: string
  readonly port: number
  readonly permissionTimeoutMs: number
}

const toError = (error: unknown): { readonly message: string } => ({
  message: formatDiagnostic(error),
})

export const serverLayer = (options: ServerOptions) =>
  RpcServer.layer(QwqRpcs).pipe(
    Layer.provide(
      QwqRpcs.toLayer({
        Ping: () => Effect.succeed({ version }),
        Ask: (payload) =>
          Effect.gen(function* () {
            const bus = yield* EventBus
            const store = yield* SessionStore
            const permissions = yield* PermissionBroker
            const origin = payload.origin
            const resolved = yield* store.resolve({
              origin,
              sessionId: Option.fromNullable(payload.sessionId),
            })
            const sessionId = resolved.session.id
            if (resolved.created) {
              yield* bus.publish({
                _tag: "SessionUpserted",
                session: summarize(resolved.session),
              })
            }
            yield* bus.publish({
              _tag: "Message",
              sessionId,
              origin,
              role: "user",
              content: payload.question,
            })
            const result = yield* store.ask(
              {
                sessionId,
                capability: capabilityOf(origin),
                shell: payload.shell,
                question: payload.question,
                envVars: payload.envVars,
              },
              {
                onDelta: (text) =>
                  bus.publish({ _tag: "Delta", sessionId, origin, content: text }),
                onToolStart: (name, detail) =>
                  bus.publish({
                    _tag: "Tool",
                    sessionId,
                    origin,
                    name,
                    phase: "start",
                    detail,
                  }),
                onToolResult: (name, detail, status) =>
                  bus.publish({
                    _tag: "Tool",
                    sessionId,
                    origin,
                    name,
                    phase: "result",
                    detail,
                    status,
                  }),
                requestPermission: (tool, detail) =>
                  permissions.request({ sessionId, origin, tool, detail }),
              },
            )
            yield* bus.publish({
              _tag: "SessionUpserted",
              session: result.summary,
            })
            yield* bus.publish({
              _tag: "Message",
              sessionId,
              origin,
              role: "assistant",
              content: result.answer,
            })
            return { sessionId, answer: result.answer }
          }).pipe(Effect.mapError(toError)),
        ListSessions: () =>
          Effect.gen(function* () {
            const store = yield* SessionStore
            return yield* store.list()
          }).pipe(Effect.mapError(toError)),
        GetSession: (payload) =>
          Effect.gen(function* () {
            const store = yield* SessionStore
            return yield* store.get(payload.sessionId)
          }).pipe(Effect.mapError(toError)),
        RenameSession: (payload) =>
          Effect.gen(function* () {
            const bus = yield* EventBus
            const store = yield* SessionStore
            const summary = yield* store.rename(
              payload.sessionId,
              payload.title,
            )
            yield* bus.publish({ _tag: "SessionUpserted", session: summary })
            return summary
          }).pipe(Effect.mapError(toError)),
        DeleteSession: (payload) =>
          Effect.gen(function* () {
            const bus = yield* EventBus
            const store = yield* SessionStore
            yield* store.remove(payload.sessionId)
            yield* bus.publish({
              _tag: "SessionDeleted",
              sessionId: payload.sessionId,
            })
            return { ok: true }
          }).pipe(Effect.mapError(toError)),
        RespondPermission: (payload) =>
          Effect.gen(function* () {
            const permissions = yield* PermissionBroker
            const ok = yield* permissions.respond(
              payload.requestId,
              payload.allow,
            )
            return { ok }
          }),
        Subscribe: () =>
          Stream.unwrap(
            Effect.gen(function* () {
              const bus = yield* EventBus
              return bus.subscribe
            }),
          ),
      }),
    ),
    Layer.provide(
      Layer.mergeAll(
        eventBusLayer,
        permissionBrokerLayer(options.permissionTimeoutMs).pipe(
          Layer.provide(eventBusLayer),
        ),
      ),
    ),
    Layer.provide(RpcServer.layerProtocolSocketServer),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(
      NodeSocketServer.layerWebSocket({
        host: options.host,
        port: options.port,
      }),
    ),
  )
