import { describe, expect, it } from "@effect/vitest"
import { RpcTest } from "@effect/rpc"
import { Effect, Fiber, Layer, Stream } from "effect"
import { QwqRpcClient, fromRpcClient } from "@qwq/shared/server/client"
import { EventBus, layer as eventBusLayer } from "@qwq/server/server/events"
import { QwqRpcs } from "@qwq/shared/server/rpc"

// The RPC handlers: only `Subscribe` is real (it forwards the EventBus), the
// others are unreachable. Connecting through `RpcTest.makeClient` gives a real
// scoped `RpcClient` with no hand-written mock.
const handlers = QwqRpcs.toLayer({
  Ping: () => Effect.die("unused"),
  Ask: () => Effect.die("unused"),
  Subscribe: () =>
    Stream.unwrap(
      Effect.map(EventBus, (bus) => bus.subscribe),
    ),
  ListSessions: () => Effect.die("unused"),
  GetSession: () => Effect.die("unused"),
  RenameSession: () => Effect.die("unused"),
  DeleteSession: () => Effect.die("unused"),
  RespondPermission: () => Effect.die("unused"),
})

// The scoped client layer owns the connection and exposes the EventBus the
// handler publishes on, so the subscription outlives the effect that built it.
const testLayer = Layer.provideMerge(
  Layer.scoped(
    QwqRpcClient,
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(QwqRpcs)
      return fromRpcClient(client)
    }),
  ).pipe(Layer.provide(handlers)),
  eventBusLayer,
)

describe("QwqRpcClient.subscribe", () => {
  it.live("receives events published after the client layer is built", () =>
    Effect.gen(function* () {
      const client = yield* QwqRpcClient
      const bus = yield* EventBus
      const fiber = yield* client.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.fork,
      )
      yield* Effect.sleep("20 millis")
      yield* bus.publish({
        _tag: "Message",
        sessionId: "s",
        origin: "cli",
        role: "user",
        content: "hi",
      })
      const events = Array.from(yield* Fiber.join(fiber))
      expect(events).toEqual([
        {
          _tag: "Message",
          sessionId: "s",
          origin: "cli",
          role: "user",
          content: "hi",
        },
      ])
    }).pipe(Effect.provide(testLayer)),
  )
})
