import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Option, Stream } from "effect"
import { EventBus, layer as eventBusLayer } from "@qwq/server/server/events"
import {
  PermissionBroker,
  layer as permissionBrokerLayer,
} from "@qwq/server/server/permissions"

describe("permission broker", () => {
  it.live("resolves a request when a frontend responds", () =>
    Effect.gen(function* () {
      const broker = yield* PermissionBroker
      const bus = yield* EventBus
      const next = yield* bus.subscribe.pipe(
        Stream.take(1),
        Stream.runHead,
        Effect.fork,
      )
      yield* Effect.sleep("20 millis")
      const answer = yield* broker
        .request({
          sessionId: "s",
          origin: "tui",
          tool: "bash",
          detail: "rm -rf build",
        })
        .pipe(Effect.fork)
      const event = yield* Fiber.join(next)
      const requestId = Option.match(event, {
        onNone: () => "",
        onSome: (value) =>
          value._tag === "Permission" ? value.requestId : "",
      })
      expect(requestId === "").toBe(false)
      yield* broker.respond(requestId, true)
      expect(yield* Fiber.join(answer)).toBe(true)
    }).pipe(
      Effect.provide(permissionBrokerLayer(60000)),
      Effect.provide(eventBusLayer),
    ),
  )

  it.live("denies when nobody responds in time", () =>
    Effect.gen(function* () {
      const broker = yield* PermissionBroker
      const allowed = yield* broker.request({
        sessionId: "s",
        origin: "tui",
        tool: "bash",
        detail: "rm -rf /",
      })
      expect(allowed).toBe(false)
    }).pipe(
      Effect.provide(permissionBrokerLayer(20)),
      Effect.provide(eventBusLayer),
    ),
  )
})
