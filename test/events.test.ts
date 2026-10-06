import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { EventBus, layer } from "@qwq/server/server/events"

describe("event bus", () => {
  it.live("delivers published events to subscribers", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bus = yield* EventBus
        const fiber = yield* bus.subscribe.pipe(
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
      }).pipe(Effect.provide(layer)),
    ),
  )
})
