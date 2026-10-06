import { randomUUID } from "node:crypto"
import {
  Context,
  Deferred,
  Effect,
  HashMap,
  Layer,
  Option,
  SynchronizedRef,
} from "effect"
import type { Origin } from "@qwq/shared/domain/session"
import { EventBus } from "./events"

export interface PermissionRequest {
  readonly sessionId: string
  readonly origin: Origin
  readonly tool: string
  readonly detail: string
}

export interface PermissionBrokerShape {
  // Publish a permission request and wait for a frontend to answer. Resolves to
  // `false` on timeout so a stalled request can never wedge the agent loop.
  readonly request: (input: PermissionRequest) => Effect.Effect<boolean>
  readonly respond: (
    requestId: string,
    allow: boolean,
  ) => Effect.Effect<boolean>
}

export class PermissionBroker extends Context.Tag("qwq/PermissionBroker")<
  PermissionBroker,
  PermissionBrokerShape
>() {}

export const layer = (
  timeoutMs: number,
): Layer.Layer<PermissionBroker, never, EventBus> =>
  Layer.scoped(
    PermissionBroker,
    Effect.gen(function* () {
      const bus = yield* EventBus
      const pending = yield* SynchronizedRef.make(
        HashMap.empty<string, Deferred.Deferred<boolean>>(),
      )
      const request = (input: PermissionRequest): Effect.Effect<boolean> =>
        Effect.gen(function* () {
          const requestId: string = randomUUID()
          const deferred = yield* Deferred.make<boolean>()
          yield* SynchronizedRef.update(
            pending,
            HashMap.set(requestId, deferred),
          )
          yield* bus.publish({
            _tag: "Permission",
            sessionId: input.sessionId,
            origin: input.origin,
            requestId,
            tool: input.tool,
            detail: input.detail,
          })
          const answer = yield* Deferred.await(deferred).pipe(
            Effect.timeoutOption(timeoutMs),
            Effect.map((option) => Option.getOrElse(option, () => false)),
          )
          yield* SynchronizedRef.update(pending, HashMap.remove(requestId))
          return answer
        })
      const respond = (
        requestId: string,
        allow: boolean,
      ): Effect.Effect<boolean> =>
        Effect.gen(function* () {
          const current = yield* SynchronizedRef.get(pending)
          const found = HashMap.get(current, requestId)
          yield* SynchronizedRef.update(pending, HashMap.remove(requestId))
          return yield* Option.match(found, {
            onNone: () => Effect.succeed(false),
            onSome: (deferred) => Deferred.succeed(deferred, allow),
          })
        })
      return PermissionBroker.of({ request, respond })
    }),
  )
