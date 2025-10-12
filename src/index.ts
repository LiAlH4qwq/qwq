import {
    pipe,
    Console,
    Effect,
    Match,
    Schema,
    String,
    Boolean
} from "effect"
import { compile, decompile } from "hxqa"

import type {
    ConfigApi,
    Message,
    Request,
    RequestBoby,
    RequestHead,
} from "./types"
import type { EnvVar } from "./env"
import {
    ConfigS,
    JsonlLineS,
    ResponseResultAnthropicS,
    ResponseResultOpenaiS
} from "./types"
import {
    getIsExeFile,
    getExePathOrSrcDir,
    getWorkingDir,
    getEnvVars
} from "./env"
import {
    qwqMetaTermId,
    qwqCmdBeginId,
    qwqCmdEndId,
    qwqMetaTermMsg,
    buildSysPrompt,
    buildShellFunc,
    buildDummyAnswer
} from "./templetes"

const main = (args: string[]) => {
    const subCommand = args.at(0)
    const restArgs = args.slice(1)
    return Match.value(subCommand).pipe(
        Match.when("integrate-shell", _ => integrateShell(restArgs)),
        Match.when("check-cmd-exist", _ => checkCmdExist(restArgs)),
        Match.when("extract-text", _ => extractText(restArgs)),
        Match.when("extract-cmd", _ => extractCommand(restArgs)),
        Match.when("ask", _ => ask(restArgs)),
        Match.orElse(_ => showHelp())
    )
}

const showHelp = () => Console.log(`
This binary is not intended for directly use, \
please refer to the document for the usage.
`.trim())

const integrateShell = (args: string[]) => pipe(
    buildShellFunc(getIsExeFile())(getExePathOrSrcDir())(argsToShellText(args)),
    Console.log
)

const checkCmdExist = (args: string[]) => pipe(
    args,
    argsToText,
    isCmdExists,
    exists => exists ? "true" : "false",
    Console.log
)

const extractText = (args: string[]) => pipe(
    args,
    argsToText,
    splitText,
    Console.log
)

const extractCommand = (args: string[]) => pipe(
    args,
    argsToText,
    splitCmd,
    Console.log
)

const ask = (args: string[]) => Effect.gen(function* () {
    const config = yield* getConfig()
    const envVars = getEnvVars(config.env_access.env_vars)
    const question = argsToText(args)
    return yield* Boolean.match(config.debug, {
        onTrue: () => askDebug(envVars)(question),
        onFalse: () => askAi(config.api)(envVars)(question)
    })
})

const askDebug = (envVars: EnvVar[]) => (question: string) => pipe(
    buildDummyAnswer(buildEnvVarsPart(envVars))(question),
    Console.log
)

const askAi = (configApi: ConfigApi) => (envVars: EnvVar[]) =>
    (question: string) => Effect.gen(function* () {
        const cache = yield* getCache()
        const req = yield* buildRequest(configApi)(cache)(envVars)(question)
        const res = yield* request(configApi.url)(req)
        const resJson = yield* responseJson(res)
        const ans = yield* Match.value(configApi.type).pipe(
            Match.when("anthropic", _ => parseResponseAnthropic(resJson)),
            Match.when("openai", _ => parseResponseOpenai(resJson)),
            Match.exhaustive
        )
        const curQa = [
            {
                role: "user",
                content: question
            },
            {
                role: "assistant",
                content: ans
            }
        ] as Message[]
        yield* updateCache(curQa)
        yield* Console.log(ans)
    })

const getConfig = () =>
    Effect.succeed(`${getWorkingDir()}/config.yaml`).pipe(
        Effect.flatMap(readFile),
        Effect.flatMap(fromYaml),
        Effect.flatMap(Schema.decodeUnknown(ConfigS))
    )

const getCache = () => Effect.gen(function* () {
    const cacheFile = fileFromPath(`${getWorkingDir()}/cache.hxqa`)
    const exists = yield* fileExist(cacheFile)
    if (!exists) {
        yield* writeFile(cacheFile)("")
        return []
    }
    return yield* fileText(cacheFile).pipe(
        Effect.flatMap(hxqaToMsgs),
        Effect.orElse(() => writeFile(cacheFile)("").pipe(Effect.as([])))
    )
})

const updateCache = (msgs: Message[]) => Effect.gen(function* () {
    if (msgs.length <= 0) return
    const cacheFile = fileFromPath(`${getWorkingDir()}/cache.hxqa`)
    if (msgs.at(-1)!.content === qwqMetaTermMsg) {
        yield* writeFile(cacheFile)("")
        return
    }
    const cache = yield* fileText(cacheFile).pipe(
        Effect.flatMap(hxqaToMsgs),
        Effect.orElse(() => writeFile(cacheFile)("").pipe(Effect.as([])))
    )
    const newCache = [...cache.slice(- 2 * (10 - 1)), ...msgs]
    yield* msgsToHxqa(newCache).pipe(Effect.flatMap(writeFile(cacheFile)))
})

const buildRequest = (configApi: ConfigApi) => (cache: readonly Message[]) =>
    (envVars: EnvVar[]) => (question: string) =>
        Effect.succeed(buildRequestBody(configApi.model)(cache)(envVars)(question)).pipe(
            Effect.flatMap(toJson),
            Effect.map(body => ({
                method: "POST",
                headers: buildRequestHead(configApi.key),
                body
            } as Request))
        )

const buildRequestHead = (apiKey: string) => ({
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
} as RequestHead)

const buildRequestBody = (model: string) => (cache: readonly Message[]) =>
    (envVars: EnvVar[]) => (question: string) => ({
        model,
        enable_thinking: false,
        messages: buildMessages(cache)(envVars)(question)
    } as RequestBoby)

const buildMessages = (cache: readonly Message[]) => (envVars: EnvVar[]) =>
    (question: string) => [
        {
            role: "system",
            content: buildSystemPrompt(envVars)
        },
        ...cache,
        {
            role: "user",
            content: question
        }
    ] as Message[]

const buildSystemPrompt = (envVars: EnvVar[]) => pipe(
    envVars,
    buildEnvVarsPart,
    buildSysPrompt
)

const buildEnvVarsPart = (envVars: EnvVar[]) =>
    envVars
        .map(envVar => `${envVar.name}: ${envVar.value}`)
        .join("\n")

const parseResponseAnthropic = (res: unknown) =>
    Schema.decodeUnknown(ResponseResultAnthropicS)(res).pipe(
        Effect.map(val => val.content.at(0)!.text),
        Effect.map(filterResponseText)
    )

const parseResponseOpenai = (res: unknown) =>
    Schema.decodeUnknown(ResponseResultOpenaiS)(res).pipe(
        Effect.map(val => val.choices.at(0)!.message.content),
        Effect.map(filterResponseText)
    )

const argsToShellText = (args: string[]) => {
    const text = args.at(0)?.trim().toLowerCase()
    return text === undefined || text === "" ? "<undefined>" : text
}

const argsToText = (args: string[]) =>
    args
        .join(" ")
        .replaceAll("\\n", "\n")
        .trim()

const filterResponseText = (text: string) => pipe(
    text,
    String.trim,
    t => t.startsWith(qwqMetaTermId) || t.endsWith(qwqMetaTermId)
        ? qwqMetaTermMsg
        : t
)

const isCmdExists = (text: string) => {
    const lastBeginIdIndex = text.lastIndexOf(qwqCmdBeginId)
    const lastEndIdIndex = text.lastIndexOf(qwqCmdEndId)
    if (lastBeginIdIndex === -1 || lastEndIdIndex === -1) return false
    if (lastBeginIdIndex > lastEndIdIndex) return false
    return true
}

const splitText = (ans: string) => pipe(
    isCmdExists(ans)
        ? ans
            .split(qwqCmdBeginId)
            .slice(0, -1)
            .join(qwqCmdBeginId)
        : ans,
    String.trim
)

const splitCmd = (ans: string) =>
    isCmdExists(ans)
        ? ans
            .split(qwqCmdBeginId)
            .at(-1)!
            .split(qwqCmdEndId)
            .at(0)!
            .trim()
        : ""

const fileFromPath = (path: string) =>
    Bun.file(path)

const fileExist = (file: Bun.BunFile) =>
    Effect.promise(() => file.exists())

const fileText = (file: Bun.BunFile) =>
    fileExist(file).pipe(Effect.flatMap(exists => exists
        ? Effect.promise(() => file.text())
        : Effect.fail("CouldntReadFile")
    ))

const readFile = (path: string) => pipe(
    path,
    fileFromPath,
    fileText
)

const writeFile = (path: string | Bun.BunFile) => (data: string) =>
    Effect.tryPromise({
        try: () => Bun.write(path, data),
        catch: (_) => "CouldntWriteFile"
    })

const msgsToHxqa = (msgs: Message[]) => Effect.succeed(msgs).pipe(
    Effect.map(msgs => ({ messages: msgs })),
    Effect.flatMap(toJson),
    Effect.flatMap(toHxqa)
)

const hxqaToMsgs = (hxqa: string) => fromHxqa(hxqa).pipe(
    Effect.flatMap(fromJson),
    Effect.flatMap(Schema.decodeUnknown(JsonlLineS)),
    Effect.map(jsonlLine => jsonlLine.messages)
)

const request = (url: string) => (data: Request) =>
    Effect.promise(() => fetch(url, data as unknown as Record<string, string>))

const responseJson = (res: Response) =>
    Effect.tryPromise({
        try: () => res.json() as Promise<unknown>,
        catch: _ => "CouldntReadResponse"
    })

const fromYaml = (yaml: string) =>
    Effect.try({
        try: () => Bun.YAML.parse(yaml),
        catch: _ => "CouldntParseYaml"
    })

const fromJson = (json: string) =>
    Effect.try({
        try: () => JSON.parse(json) as unknown,
        catch: _ => "CouldntParseJson"
    })

const toJson = (data: unknown) =>
    Effect.try({
        try: () => JSON.stringify(data),
        catch: _ => "CouldntGenerateJson"
    })

const fromHxqa = (hxqa: string) => pipe(
    hxqa,
    compile,
    fromHxqaResult
)

const toHxqa = (jsonl: string) => pipe(
    jsonl,
    decompile,
    fromHxqaResult
)

const fromHxqaResult = (
    res: { pass: true, value: string }
        | { pass: false, error: unknown }
) =>
    res.pass
        ? Effect.succeed(res.value)
        : Effect.fail(res.error)

if (import.meta.main)
    main(Bun.argv.slice(2)).pipe(
        Effect.catchAll(e => Console.log("啊！出错了呢：\n", e)),
        Effect.runFork
    )