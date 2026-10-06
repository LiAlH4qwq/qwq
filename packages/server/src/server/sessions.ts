import type { CommandExecutor } from "@effect/platform"
import type { FileSystem, HttpClient } from "@effect/platform"
import { randomUUID } from "node:crypto"
import {
  Context,
  Effect,
  HashMap,
  Layer,
  Option,
  SynchronizedRef,
} from "effect"
import { askWithHistory, type AgentHooks, type AskError } from "../agent/ask"
import { compactHistory } from "../agent/compact"
import type { PromptCapability } from "../agent/prompt"
import { generateTopic } from "../agent/title"
import type { Config } from "@qwq/shared/config/schema"
import type { EnvVar } from "@qwq/shared/domain/env"
import {
  fallbackTopic,
  summarize,
  timeTitle,
  topicTitle,
  type Origin,
  type Session,
  type SessionSummary,
} from "@qwq/shared/domain/session"
import {
  SessionNotFoundError,
  type SessionReadError,
  type SessionWriteError,
} from "@qwq/shared/errors"
import {
  readAllSessions,
  readSession,
  removeSession,
  writeSession,
} from "../memory/store"
import { defaultSessionsDir } from "@qwq/shared/paths"

export type SessionStoreError = SessionReadError | SessionWriteError
export type SessionAskError =
  | AskError
  | SessionStoreError
  | SessionNotFoundError

export interface SessionResolveInput {
  readonly origin: Origin
  readonly sessionId: Option.Option<string>
}

export interface ResolvedSession {
  readonly session: Session
  readonly created: boolean
}

export interface SessionRunInput {
  readonly sessionId: string
  readonly capability: PromptCapability
  readonly shell: string
  readonly question: string
  readonly envVars: ReadonlyArray<EnvVar>
}

export interface SessionAnswer {
  readonly answer: string
  readonly summary: SessionSummary
}

export interface SessionStoreShape {
  readonly resolve: (
    input: SessionResolveInput,
  ) => Effect.Effect<ResolvedSession, SessionStoreError, FileSystem.FileSystem>
  readonly ask: (
    input: SessionRunInput,
    hooks: AgentHooks,
  ) => Effect.Effect<
    SessionAnswer,
    SessionAskError,
    HttpClient.HttpClient | FileSystem.FileSystem | CommandExecutor.CommandExecutor
  >
  readonly list: () => Effect.Effect<
    ReadonlyArray<SessionSummary>,
    SessionStoreError,
    FileSystem.FileSystem
  >
  readonly get: (
    sessionId: string,
  ) => Effect.Effect<
    Session,
    SessionNotFoundError | SessionStoreError,
    FileSystem.FileSystem
  >
  readonly rename: (
    sessionId: string,
    title: string,
  ) => Effect.Effect<
    SessionSummary,
    SessionNotFoundError | SessionStoreError,
    FileSystem.FileSystem
  >
  readonly remove: (
    sessionId: string,
  ) => Effect.Effect<void, SessionStoreError, FileSystem.FileSystem>
}

export class SessionStore extends Context.Tag("qwq/SessionStore")<
  SessionStore,
  SessionStoreShape
>() {}

const makeSession = (
  id: string,
  origin: Origin,
  now: number,
  reuseMs: number,
): Session => ({
  id,
  title: timeTitle(origin, now),
  origin,
  createdAt: now,
  updatedAt: now,
  voiceExpiresAt: origin === "voice" ? now + reuseMs : 0,
  messages: [],
})

const latestOf = (
  sessions: Iterable<Session>,
  predicate: (session: Session) => boolean,
): Option.Option<Session> =>
  Array.from(sessions).reduce<Option.Option<Session>>(
    (best, session) =>
      predicate(session) &&
      (Option.isNone(best) || session.updatedAt > best.value.updatedAt)
        ? Option.some(session)
        : best,
    Option.none(),
  )

const make = (
  config: Config,
): Effect.Effect<SessionStoreShape, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const dir =
      config.sessions.dir === "" ? defaultSessionsDir() : config.sessions.dir
    const reuseMs = config.sessions.reuseMinutes * 60000
    const initial = yield* readAllSessions(dir).pipe(
      Effect.catchAll((error) =>
        Effect.logWarning(`读取会话目录失败：${error.path}`).pipe(
          Effect.as([] as ReadonlyArray<Session>),
        ),
      ),
    )
    const store = yield* SynchronizedRef.make(
      initial.reduce(
        (map, session) => HashMap.set(map, session.id, session),
        HashMap.empty<string, Session>(),
      ),
    )

    const find = (
      id: string,
    ): Effect.Effect<
      Option.Option<Session>,
      SessionReadError,
      FileSystem.FileSystem
    > =>
      Effect.gen(function* () {
        const cached = HashMap.get(yield* SynchronizedRef.get(store), id)
        if (Option.isSome(cached)) {
          return cached
        }
        const disk = yield* readSession(dir, id)
        if (Option.isSome(disk)) {
          yield* SynchronizedRef.update(store, HashMap.set(id, disk.value))
        }
        return disk
      })

    const persist = (
      session: Session,
    ): Effect.Effect<void, SessionWriteError, FileSystem.FileSystem> =>
      writeSession(dir, session).pipe(
        Effect.zipRight(
          SynchronizedRef.update(store, HashMap.set(session.id, session)),
        ),
      )

    const getOrFail = (
      id: string,
    ): Effect.Effect<
      Session,
      SessionNotFoundError | SessionReadError,
      FileSystem.FileSystem
    > =>
      find(id).pipe(
        Effect.flatMap((found) =>
          Option.match(found, {
            onNone: () => Effect.fail(new SessionNotFoundError({ sessionId: id })),
            onSome: (session) => Effect.succeed(session),
          }),
        ),
      )

    const resolve = (
      input: SessionResolveInput,
    ): Effect.Effect<ResolvedSession, SessionStoreError, FileSystem.FileSystem> =>
      Effect.gen(function* () {
        const now = yield* Effect.sync(() => Date.now())
        const existing = yield* Option.match(input.sessionId, {
          onNone: () =>
            input.origin === "voice" || input.origin === "command"
              ? SynchronizedRef.get(store).pipe(
                  Effect.map((map) =>
                    latestOf(
                      HashMap.values(map),
                      (session) =>
                        session.origin === input.origin &&
                        (input.origin === "voice"
                          ? session.voiceExpiresAt > now
                          : now - session.updatedAt <= reuseMs),
                    ),
                  ),
                )
              : Effect.succeed(Option.none<Session>()),
          onSome: (id) => find(id),
        })
        if (Option.isSome(existing)) {
          return { session: existing.value, created: false }
        }
        const id = Option.getOrElse(input.sessionId, () => randomUUID())
        const session = makeSession(id, input.origin, now, reuseMs)
        yield* persist(session)
        return { session, created: true }
      })

    const ask = (
      input: SessionRunInput,
      hooks: AgentHooks,
    ): Effect.Effect<
      SessionAnswer,
      SessionAskError,
      HttpClient.HttpClient | FileSystem.FileSystem | CommandExecutor.CommandExecutor
    > =>
      Effect.gen(function* () {
        const session = yield* getOrFail(input.sessionId)
        const history = config.debug
          ? session.messages
          : yield* compactHistory(config, session.messages)
        const firstTurn = session.messages.length === 0
        const wantsTitle =
          !config.debug &&
          config.sessions.title.enable &&
          firstTurn &&
          session.origin !== "command"
        const titleEffect = wantsTitle
          ? generateTopic(config, input.question).pipe(
              Effect.catchAll(() => Effect.succeed(Option.none<string>())),
            )
          : Effect.succeed(Option.none<string>())
        const [outcome, topic] = yield* Effect.all(
          [
            askWithHistory({
              config,
              capability: input.capability,
              envVars: input.envVars,
              shellName: input.shell,
              question: input.question,
              history,
              hooks,
            }),
            titleEffect,
          ],
          { concurrency: "unbounded" },
        )
        const now = yield* Effect.sync(() => Date.now())
        const fallback = fallbackTopic(
          input.question,
          config.sessions.title.maxChars,
        )
        const title =
          config.sessions.title.enable && firstTurn
            ? Option.match(topic, {
                onNone: () =>
                  Option.match(fallback, {
                    onNone: () => session.title,
                    onSome: (value) => topicTitle(session.origin, value),
                  }),
                onSome: (value) => topicTitle(session.origin, value),
              })
            : session.title
        const updated: Session = {
          ...session,
          title,
          messages: outcome.messages,
          updatedAt: now,
          voiceExpiresAt:
            session.origin === "voice"
              ? now + reuseMs
              : session.voiceExpiresAt,
        }
        yield* persist(updated)
        return { answer: outcome.answer, summary: summarize(updated) }
      })

    const list = (): Effect.Effect<
      ReadonlyArray<SessionSummary>,
      SessionStoreError,
      FileSystem.FileSystem
    > =>
      SynchronizedRef.get(store).pipe(
        Effect.map((map) =>
          Array.from(HashMap.values(map))
            .map(summarize)
            .toSorted((a, b) => b.updatedAt - a.updatedAt),
        ),
      )

    const get = (
      sessionId: string,
    ): Effect.Effect<
      Session,
      SessionNotFoundError | SessionReadError,
      FileSystem.FileSystem
    > => getOrFail(sessionId)

    const rename = (
      sessionId: string,
      title: string,
    ): Effect.Effect<
      SessionSummary,
      SessionNotFoundError | SessionStoreError,
      FileSystem.FileSystem
    > =>
      Effect.gen(function* () {
        const session = yield* getOrFail(sessionId)
        const trimmed = title.trim()
        const now = yield* Effect.sync(() => Date.now())
        const updated: Session = {
          ...session,
          title: trimmed === "" ? session.title : trimmed,
          updatedAt: now,
        }
        yield* persist(updated)
        return summarize(updated)
      })

    const remove = (
      sessionId: string,
    ): Effect.Effect<void, SessionStoreError, FileSystem.FileSystem> =>
      removeSession(dir, sessionId).pipe(
        Effect.zipRight(
          SynchronizedRef.update(store, HashMap.remove(sessionId)),
        ),
      )

    return SessionStore.of({
      resolve,
      ask,
      list,
      get,
      rename,
      remove,
    })
  })

export const layer = (
  config: Config,
): Layer.Layer<SessionStore, never, FileSystem.FileSystem> =>
  Layer.effect(SessionStore, make(config))
