import { FileSystem } from "@effect/platform"
import { Effect, Option, Schema } from "effect"
import { Session } from "@qwq/shared/domain/session"
import { SessionReadError, SessionWriteError } from "@qwq/shared/errors"

export const sessionFile = (dir: string, id: string): string =>
  `${dir}/${id}.json`

export const readSession = (
  dir: string,
  id: string,
): Effect.Effect<Option.Option<Session>, SessionReadError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = sessionFile(dir, id)
    const exists = yield* fs
      .exists(path)
      .pipe(Effect.mapError((cause) => new SessionReadError({ path, cause })))
    if (!exists) {
      return Option.none<Session>()
    }
    const content = yield* fs
      .readFileString(path)
      .pipe(Effect.mapError((cause) => new SessionReadError({ path, cause })))
    if (content.trim() === "") {
      return Option.none<Session>()
    }
    return Option.some(
      yield* Schema.decodeUnknown(Schema.parseJson(Session))(content).pipe(
        Effect.mapError((cause) => new SessionReadError({ path, cause })),
      ),
    )
  })

export const writeSession = (
  dir: string,
  session: Session,
): Effect.Effect<void, SessionWriteError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = sessionFile(dir, session.id)
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(Effect.mapError((cause) => new SessionWriteError({ path, cause })))
    yield* fs
      .writeFileString(path, JSON.stringify(session, null, 2))
      .pipe(Effect.mapError((cause) => new SessionWriteError({ path, cause })))
  })

export const removeSession = (
  dir: string,
  id: string,
): Effect.Effect<void, SessionWriteError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = sessionFile(dir, id)
    const exists = yield* fs
      .exists(path)
      .pipe(Effect.mapError((cause) => new SessionWriteError({ path, cause })))
    if (!exists) {
      return
    }
    yield* fs
      .remove(path)
      .pipe(Effect.mapError((cause) => new SessionWriteError({ path, cause })))
  })

export const readAllSessions = (
  dir: string,
): Effect.Effect<
  ReadonlyArray<Session>,
  SessionReadError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const exists = yield* fs
      .exists(dir)
      .pipe(Effect.mapError((cause) => new SessionReadError({ path: dir, cause })))
    if (!exists) {
      return [] as ReadonlyArray<Session>
    }
    const entries = yield* fs
      .readDirectory(dir)
      .pipe(Effect.mapError((cause) => new SessionReadError({ path: dir, cause })))
    const ids = entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length))
    const sessions = yield* Effect.all(
      ids.map((id) =>
        readSession(dir, id).pipe(
          Effect.match({
            onFailure: () => [] as ReadonlyArray<Session>,
            onSuccess: (value) => Option.toArray(value),
          }),
        ),
      ),
      // Bounded so a large session directory does not spike CPU/IO at startup.
      { concurrency: 8 },
    )
    return sessions.flat()
  })
