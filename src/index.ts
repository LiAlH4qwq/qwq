import {
    Boolean,
    Console,
    Effect,
    Match,
    ParseResult,
    pipe,
    Schema,
    String,
} from "effect"
import { compile, decompile } from "hxqa"
import type { EnvVar } from "./env"
import {
    getEnvVars,
    getExePathOrSrcDir,
    getIsExeFile,
    getWorkingDir,
} from "./env"
import {
    buildDummyAnswer,
    buildShellFunc,
    buildSysPrompt,
    qwqCmdBeginId,
    qwqCmdEndId,
    qwqMetaTermId,
    qwqMetaTermMsg,
} from "./templetes"
import type {
    ConfigApi,
    Message,
    Request,
    RequestBoby,
    RequestHead,
} from "./types"
import {
    ConfigS,
    JsonlLineS,
    ResponseResultAnthropicS,
    ResponseResultOpenaiS,
} from "./types"

const main = (args: string[]) => {
    const subCommand = args.at(0)
    const restArgs = args.slice(1)
    return Match.value(subCommand).pipe(
        Match.when("integrate-shell", _ => integrateShell(restArgs)),
        Match.when("check-cmd-exist", _ => checkCmdExist(restArgs)),
        Match.when("extract-text", _ => extractText(restArgs)),
        Match.when("extract-cmd", _ => extractCommand(restArgs)),
        Match.when("ask", _ => ask(restArgs)),
        Match.orElse(_ => showHelp()),
    )
}

const showHelp = () =>
    Console.log(
        `
不推荐直接使用这个二进制文件呢，建议根据文档配置 shell 集成喵
不过如果要直接使用的话，这是帮助：
Usage: <startCmd> <ask | extract-text | extract-cmd | check-cmd-exist | integrate-shell> <restArgs...>
嘛~ 不想写帮助了 pwq
`.trim(),
    )

const integrateShell = (args: string[]) =>
    pipe(
        buildShellFunc(getIsExeFile())(getExePathOrSrcDir())(
            argsToShellName(args),
        ),
        Console.log,
    )

const checkCmdExist = (args: string[]) =>
    pipe(
        args,
        argsToText,
        isCmdExists,
        exists => (exists ? "true" : "false"),
        Console.log,
    )

const extractText = (args: string[]) =>
    pipe(args, argsToText, splitText, Console.log)

const extractCommand = (args: string[]) =>
    pipe(args, argsToText, splitCmd, Console.log)

const ask = (args: string[]) =>
    Effect.gen(function* () {
        const config = yield* getConfig()
        const envVars = getEnvVars(config.env_access.env_vars)
        const question = argsToText(args)
        return yield* Boolean.match(config.debug, {
            onTrue: () => askDebug(envVars)(question),
            onFalse: () => askAi(config.api)(envVars)(question),
        })
    })

const askDebug = (envVars: EnvVar[]) => (question: string) =>
    pipe(buildDummyAnswer(buildEnvVarsPart(envVars))(question), Console.log)

const askAi =
    (configApi: ConfigApi) => (envVars: EnvVar[]) => (question: string) =>
        Effect.gen(function* () {
            const cache = yield* getCache()
            const req = buildRequest(configApi)(cache)(envVars)(question)
            const res = yield* makeRequest(configApi.url)(req)
            const resText = yield* responseText(res)
            const resJson = yield* json2Data(resText)
            const ans = yield* Match.value(configApi.type).pipe(
                Match.when("anthropic", _ => parseResponseAnthropic(resJson)),
                Match.when("openai", _ => parseResponseOpenai(resJson)),
                Match.exhaustive,
            )
            const curQa = [
                {
                    role: "user",
                    content: question,
                },
                {
                    role: "assistant",
                    content: ans,
                },
            ] as Message[]
            yield* updateCache(curQa)
            yield* Console.log(ans)
        })

const getConfig = () =>
    Effect.succeed(`${getWorkingDir()}/config.yaml`).pipe(
        Effect.flatMap(readFile),
        Effect.flatMap(yaml2Data),
        Effect.flatMap(Schema.decodeUnknown(ConfigS)),
        Effect.mapError(
            e =>
                `啊，配置文件好像有问题呢，要不查下文档看下怎么配置喵：
${typeof e === "string" ? e : ParseResult.TreeFormatter.formatErrorSync(e)}`,
        ),
    )

const getCache = () =>
    Effect.gen(function* () {
        const cacheFile = fileFromPath(`${getWorkingDir()}/cache.hxqa`)
        const exists = yield* fileExist(cacheFile)
        if (!exists) {
            yield* writeFile(cacheFile)("")
            return []
        }
        return yield* fileText(cacheFile).pipe(
            Effect.flatMap(hxqa2Msgs),
            Effect.tapError(e =>
                Console.log(`啊，缓存文件疑似损坏了，我就清空缓存啦：\n${e}`),
            ),
            Effect.orElse(() => writeFile(cacheFile)("").pipe(Effect.as([]))),
        )
    })

const updateCache = (msgs: Message[]) =>
    Effect.gen(function* () {
        if (msgs.length <= 0) return
        const cacheFile = fileFromPath(`${getWorkingDir()}/cache.hxqa`)
        if (msgs.at(-1)!.content === qwqMetaTermMsg) {
            yield* writeFile(cacheFile)("")
            return
        }
        const cache = yield* fileText(cacheFile).pipe(
            Effect.flatMap(hxqa2Msgs),
            Effect.tapError(e =>
                Console.log(`啊，缓存文件疑似损坏了，我就清空缓存啦：\n${e}`),
            ),
            Effect.orElse(() => writeFile(cacheFile)("").pipe(Effect.as([]))),
        )
        const newCache = [...cache.slice(-2 * (10 - 1)), ...msgs]
        yield* msgs2Hxqa(newCache).pipe(Effect.flatMap(writeFile(cacheFile)))
    })

const buildRequest =
    (configApi: ConfigApi) =>
    (cache: readonly Message[]) =>
    (envVars: EnvVar[]) =>
    (question: string) =>
        pipe(
            buildRequestBody(configApi.model)(cache)(envVars)(question),
            data2Json,
            body =>
                ({
                    method: "POST",
                    headers: buildRequestHead(configApi.key),
                    body,
                }) as Request,
        )

const buildRequestHead = (apiKey: string) =>
    ({
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    }) as RequestHead

const buildRequestBody =
    (model: string) =>
    (cache: readonly Message[]) =>
    (envVars: EnvVar[]) =>
    (question: string) =>
        ({
            model,
            enable_thinking: false,
            messages: buildMessages(cache)(envVars)(question),
        }) as RequestBoby

const buildMessages =
    (cache: readonly Message[]) => (envVars: EnvVar[]) => (question: string) =>
        [
            {
                role: "system",
                content: buildSystemPrompt(envVars),
            },
            ...cache,
            {
                role: "user",
                content: question,
            },
        ] as Message[]

const buildSystemPrompt = (envVars: EnvVar[]) =>
    pipe(envVars, buildEnvVarsPart, buildSysPrompt)

const buildEnvVarsPart = (envVars: EnvVar[]) =>
    envVars.map(envVar => `${envVar.name}: ${envVar.value}`).join("\n")

const parseResponseAnthropic = (res: unknown) =>
    Schema.decodeUnknown(ResponseResultAnthropicS)(res).pipe(
        Effect.map(val => val.content.at(0)!.text),
        Effect.map(processAnsText),
        Effect.mapError(ParseResult.TreeFormatter.formatErrorSync),
        Effect.mapError(e => `这个服务器答复我看不太懂呢……\n${res}\n${e}`),
    )

const parseResponseOpenai = (res: unknown) =>
    Schema.decodeUnknown(ResponseResultOpenaiS)(res).pipe(
        Effect.map(val => val.choices.at(0)!.message.content),
        Effect.map(processAnsText),
        Effect.mapError(ParseResult.TreeFormatter.formatErrorSync),
        Effect.mapError(e => `这个服务器答复我看不太懂呢……\n${res}\n${e}`),
    )

const argsToShellName = (args: string[]) => {
    const text = args.at(0)?.trim().toLowerCase()
    return text === undefined || text === "" ? "<undefined>" : text
}

const argsToText = (args: string[]) =>
    args.join(" ").replaceAll("\\n", "\n").trim()

const processAnsText = (text: string) =>
    pipe(text, String.trim, t =>
        t.startsWith(qwqMetaTermId) || t.endsWith(qwqMetaTermId)
            ? qwqMetaTermMsg
            : t,
    )

const isCmdExists = (text: string) => {
    const lastBeginIdIndex = text.lastIndexOf(qwqCmdBeginId)
    const lastEndIdIndex = text.lastIndexOf(qwqCmdEndId)
    if (lastBeginIdIndex === -1 || lastEndIdIndex === -1) return false
    if (lastBeginIdIndex > lastEndIdIndex) return false
    return true
}

const splitText = (ans: string) =>
    pipe(
        isCmdExists(ans)
            ? ans.split(qwqCmdBeginId).slice(0, -1).join(qwqCmdBeginId)
            : ans,
        String.trim,
    )

const splitCmd = (ans: string) =>
    isCmdExists(ans)
        ? ans.split(qwqCmdBeginId).at(-1)!.split(qwqCmdEndId).at(0)!.trim()
        : ""

const fileFromPath = (path: string) => Bun.file(path)

const fileExist = (file: Bun.BunFile) => Effect.promise(() => file.exists())

// 如果文件存在但是没有权限读写，进程也是会直接崩溃的
// 所以 Effect.try 没有意义 qeq

const fileText = (file: Bun.BunFile) =>
    fileExist(file).pipe(
        Effect.flatMap(exists =>
            exists
                ? Effect.promise(() => file.text())
                : Effect.fail("FileNotFound"),
        ),
    )

const readFile = (path: string) => pipe(path, fileFromPath, fileText)

const writeFile = (pathOrFile: string | Bun.BunFile) => (data: string) =>
    Effect.promise(() => Bun.write(pathOrFile, data))

const msgs2Hxqa = (msgs: Message[]) =>
    Effect.succeed(msgs).pipe(
        Effect.map(msgs => ({ messages: msgs })),
        Effect.map(data2Json),
        Effect.flatMap(jsonl2Hxqa),
    )

const hxqa2Msgs = (hxqa: string) =>
    hxqa2Jsonl(hxqa).pipe(
        Effect.flatMap(json2Data),
        Effect.flatMap(Schema.decodeUnknown(JsonlLineS)),
        Effect.map(jsonlLine => jsonlLine.messages),
    )

// Bun 的 fetch 就算出错也是没法捕获的 pwq

const makeRequest = (url: string) => (data: Request) =>
    Effect.promise(() => fetch(url, data as unknown as Record<string, string>))

const responseText = (res: Response) => Effect.promise(() => res.text())

const hxqa2Jsonl = (hxqa: string) => pipe(hxqa, compile, hxqaResult2Effect)

const jsonl2Hxqa = (jsonl: string) => pipe(jsonl, decompile, hxqaResult2Effect)

const hxqaResult2Effect = (
    res: { pass: true; value: string } | { pass: false; error: object },
) =>
    res.pass
        ? Effect.succeed(res.value)
        : Effect.fail(pipe(res.error, data2JsonPretty))

// 啊，Bun 上的 Bun.YAML.parse 和 JSON.parse 的错误能捕获
// 但没法访问到任何错误信息
// 所以只能返回一个很模糊的错误信息了

const yaml2Data = (yaml: string) =>
    Effect.try({
        try: () => Bun.YAML.parse(yaml),
        catch: _ => "CouldntParseYaml",
    })

const json2Data = (json: string) =>
    Effect.try({
        try: () => JSON.parse(json) as unknown,
        catch: _ => "CouldntParseJson",
    })

// 呐，在 Bun 上，JSON.stringify 的错误是没法被 try 捕获的
// 所以这两个函数就不用 Effect.try 啦

const data2JsonPretty = (data: unknown) => JSON.stringify(data, undefined, 2)

const data2Json = (data: unknown) => JSON.stringify(data)

if (import.meta.main)
    main(Bun.argv.slice(2)).pipe(
        Effect.catchAll(e => Console.log("好像出错了呢：\n", e)),
        Effect.runFork,
    )
