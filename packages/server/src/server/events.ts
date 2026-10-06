import { Context, Effect, Layer, PubSub, Stream } from "effect"
import type { QwqEvent } from "@qwq/shared/server/rpc"

export interface EventBusShape {
  readonly publish: (event: QwqEvent) => Effect.Effect<void>
  readonly subscribe: Stream.Stream<QwqEvent>
}

export class EventBus extends Context.Tag("qwq/EventBus")<
  EventBus,
  EventBusShape
>() {}

export const layer: Layer.Layer<EventBus> = Layer.scoped(
  EventBus,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<QwqEvent>()
    const publish = (event: QwqEvent) =>
      PubSub.publish(pubsub, event).pipe(Effect.asVoid)
    const subscribe = Stream.fromPubSub(pubsub)
    return EventBus.of({ publish, subscribe })
  }),
)
