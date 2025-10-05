import { Either, Match } from "effect"
import { decodeUnknownEither } from "effect/Schema"
import { compile, decompile } from "hxqa"

import type {
    QwqAnyhowResult as Result,
    QwqError,
    Config,
    Message,
    Request,
    RequestBoby,
} from "./types"
import type { EnvVar } from "./env"
import {
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

// Dirty
type Entry = (args: string[]) => Promise<void>
type AskDebug = (question: string) => Promise<string>
type GetConfig = () => Promise<Config>
type RotateThenGetCache = (newMessages: Message[]) => Promise<Message[]>

// Pure
type Builder<T> = (question: string, cache: Message[], config: Config, envVars: EnvVar[]) => Promise<T>
type BuildRequest = Builder<Request>
type BuildRequestBody = Builder<RequestBoby>
type BuildEnvVarsPart = (envVars: EnvVar[]) => Promise<string>
type Sleep = (ms: number) => Promise<void>
type ArgsToText = (args: string[]) => Promise<string>
type IsCmdExists = (text: string) => Promise<boolean>
type SplitTextAndCmd = (answer: string) => Promise<[string, string]>
type FilterResponseText = (text: string) => Promise<string>
type MessagesToHxqa = (messages: Message[]) => Promise<string>
type HxqaToMessages = (hxqa: string) => Promise<Message[]>

const main = async (args: string[]) => {
    const subCommand = args.at(0)
    const restArgs = args.slice(1)
    Match.value(subCommand).pipe(
        Match.when("integrate-shell", _ => integrateShell(restArgs)),
        Match.when("check-cmd-exist", _ => checkCmdExist(restArgs)),
        Match.when("extract-text", _ => extractText(restArgs)),
        Match.when("extract-cmd", _ => extractCommand(restArgs)),
        Match.when("ask", _ => ask(restArgs)),
        Match.orElse(_ => showHelp())
    )
}

const showHelp = async () => console.log("TODO")

const integrateShell: Entry = async (args) => {
    const shellText =
        args.at(0)
            ?.trim()
            .toLowerCase()
    const shell =
        shellText === undefined
            || shellText === ""
            ? "<undefined>" : shellText
    const isExeFile = getIsExeFile()
    const path = getExePathOrSrcDir()
    const shellFunc = buildShellFunc(isExeFile, path, shell)
    console.log(shellFunc)
}

const checkCmdExist: Entry = async (args) => {
    const answer = await argsToText(args)
    await isCmdExists(answer) ? console.log("true") : console.log("false")
}

const extractText: Entry = async (args) => {
    const answer = await argsToText(args)
    const textAndCmd = await splitTextAndCmd(answer)
    const text = textAndCmd.at(0)
    console.log(text)
}

const extractCommand: Entry = async (args) => {
    const answer = await argsToText(args)
    const textAndCmd = await splitTextAndCmd(answer)
    const cmd = textAndCmd.at(1)
    console.log(cmd)
}

const ask: Entry = async (args) => {
    const question = await argsToText(args)
    const config = await getConfig()
    const envVars = getEnvVars(config.env_access.env_vars)
    if (config.debug) {
        const answer = await askDebug(question)
        console.log(answer)
    }
    else {
        (await askAi(question, config, envVars)).pipe(
            Either.match({
                onLeft: (err) => {
                    console.log("出错了喵：")
                    console.log(err)
                },
                onRight: (ans) => {
                    console.log(ans)
                }
            })
        )
    }
}

const askDebug: AskDebug = async (question) => {
    const dummyAnswer = buildDummyAnswer(question)
    await sleep(1000)
    return dummyAnswer
}

const askAi = async (
    question: string,
    config: Config,
    envVars: EnvVar[]
): Promise<Result<string>> => {
    const apiType = config.api.type
    const cache = await rotateThenGetCache([])
    const request = await buildRequest(question, cache, config, envVars)
    const response = await fetch(config.api.url, request)
    const result = await response.json()
    if (apiType === "anthropic") {
        const rawTextMaybe = await parseResponseAnthropic(result)
        if (Either.isLeft(rawTextMaybe)) return rawTextMaybe
        const text = await filterResponseText(rawTextMaybe.right)
        const messages: Message[] = [
            {
                role: "user",
                content: question
            },
            {
                role: "assistant",
                content: text
            }
        ]
        await rotateThenGetCache(messages)
        return rawTextMaybe
    } else if (apiType === "openai") {
        const rawTextMaybe = await parseResponseOpenai(result)
        if (Either.isLeft(rawTextMaybe)) return rawTextMaybe
        const text = await filterResponseText(rawTextMaybe.right)
        const messages: Message[] = [
            {
                role: "user",
                content: question
            },
            {
                role: "assistant",
                content: text
            }
        ]
        await rotateThenGetCache(messages)
        return rawTextMaybe
    } else {
        const errText = `暂时还不支持${apiType}这种API喵`
        const err: QwqError = {
            stage: "AskingAi",
            category: "ApiConfigError",
            what: "UnknownApiType",
            details: errText,
            raw: undefined
        }
        return Either.left(err)
    }
}

const getConfig: GetConfig = async () => {
    const configDir = getWorkingDir()
    const configPath = `${configDir}/config.yaml`
    const configFile = Bun.file(configPath)
    const configText = await configFile.text()
    const config = Bun.YAML.parse(configText) as Config
    return config
}

const rotateThenGetCache: RotateThenGetCache = async (newMessages) => {
    const cacheDir = getWorkingDir()
    const cachePath = `${cacheDir}/cache.hxqa`
    const cacheFile = Bun.file(cachePath)
    const newMessagesHxqa = await messagesToHxqa(newMessages)
    if (!await cacheFile.exists()) {
        await cacheFile.write(newMessagesHxqa)
        return newMessages
    }
    const cacheHxqa = await cacheFile.text()
    const cache = await hxqaToMessages(cacheHxqa)
    if (cache.length <= 0 || cache.at(-1)!.content === qwqMetaTermMsg) {
        await cacheFile.write(newMessagesHxqa)
        return newMessages
    }
    const rotatedCache = cache.slice(- (10 - 1) * 2)
    const newCache = [...rotatedCache, ...newMessages]
    const newCacheHxqa = await messagesToHxqa(newCache)
    await cacheFile.write(newCacheHxqa)
    return newCache
}

const buildRequest: BuildRequest = async (question, cache, config, envVars) => {
    const headers = new Headers()
    headers.append("Authorization", `Bearer ${config.api.key}`)
    headers.append("Content-Type", "application/json")
    const body = await buildRequestBody(question, cache, config, envVars)
    const request = {
        method: "POST" as "POST",
        headers: headers,
        body: JSON.stringify(body)
    }
    return request
}

const buildRequestBody: BuildRequestBody = async (question, cache, config, envVars) => {
    const messages = await buildMessages(question, cache, envVars)
    const body = {
        model: config.api.model,
        messages: messages
    }
    return body
}

const buildMessages = async (question: string, cache: Message[], envVars: EnvVar[]) => {
    const systemPrompt = await buildSystemPrompt(envVars)
    const systemMessage = {
        role: "system" as "system",
        content: systemPrompt
    }
    const questionMessage = {
        role: "user" as "user",
        content: question
    }
    const messages = [systemMessage, ...cache, questionMessage]
    return messages
}

const buildSystemPrompt = async (envVars: EnvVar[]) => {
    const envVarsPart = await buildEnvVarsPart(envVars)
    const systemPrompt = buildSysPrompt(envVarsPart)
    return systemPrompt
}

const buildEnvVarsPart: BuildEnvVarsPart = async (envVars) => {
    const envVarsLine = envVars.map(envVar => `${envVar.name}: ${envVar.value}`)
    const envVarsPart = envVarsLine.join("\n")
    return envVarsPart
}

const parseResponseAnthropic = async (
    response: unknown
): Promise<Result<string>> =>
    decodeUnknownEither(ResponseResultAnthropicS)(response).pipe(
        Either.map(res => res.content.at(0)!.text),
        Either.mapLeft(err => {
            const qwqErr: QwqError = {
                stage: "ParsingResponse",
                category: "UnexepectedResponse",
                what: "UnknownResponseStructure",
                details: err.message,
                raw: err
            }
            return qwqErr
        })
    )

const parseResponseOpenai = async (
    response: unknown
): Promise<Result<string>> =>
    decodeUnknownEither(ResponseResultOpenaiS)(response).pipe(
        Either.map(res => res.choices.at(0)!.message.content),
        Either.mapLeft(err => {
            const qwqErr: QwqError = {
                stage: "ParsingResponse",
                category: "UnexepectedResponse",
                what: "UnknownResponseStructure",
                details: err.message,
                raw: err
            }
            return qwqErr
        })
    )

const sleep: Sleep = async (ms) =>
    await new Promise(resolve => setTimeout(() => resolve(), ms))

const argsToText: ArgsToText = async (args) =>
    args
        .join(" ")
        .replaceAll("\\n", "\n")
        .trim()

const filterResponseText: FilterResponseText = async (text) => {
    const trimmedText = text.trim()
    if (trimmedText.startsWith(qwqMetaTermId)
        || trimmedText.endsWith(qwqMetaTermId))
        return qwqMetaTermMsg
    return trimmedText
}

const isCmdExists: IsCmdExists = async (text) => {
    const lastBeginIdIndex = text.lastIndexOf(qwqCmdBeginId)
    const lastEndIdIndex = text.lastIndexOf(qwqCmdEndId)
    if (lastBeginIdIndex === -1 || lastEndIdIndex === -1) return false
    else if (lastBeginIdIndex > lastEndIdIndex) return false
    else return true
}

const splitTextAndCmd: SplitTextAndCmd = async (answer) => {
    const cmdExists = await isCmdExists(answer)
    if (!cmdExists) return [answer.trim(), ""]
    const answerSplitedByBeginId = answer.split(qwqCmdBeginId)
    const text =
        answerSplitedByBeginId
            .slice(0, -1)
            .join(qwqCmdBeginId)
            .trim()
    const command =
        answerSplitedByBeginId
            .at(-1)!
            .split(qwqCmdEndId)
            .at(0)!
            .trim()
    return [text, command]
}

const messagesToHxqa: MessagesToHxqa = async (messages) => {
    const messagesWrapped = { messages }
    const messagesJsonl = JSON.stringify(messagesWrapped)
    const result = decompile(messagesJsonl)
    if (result.pass) return result.value
    else return ""
}

const hxqaToMessages: HxqaToMessages = async (hxqa) => {
    const result = compile(hxqa)
    if (!result.pass) return []
    const jsonl = result.value
    const messagesWrapped = JSON.parse(jsonl) as { messages: Message[] }
    const messages = messagesWrapped.messages
    return messages
}

if (import.meta.main) main(Bun.argv.slice(2))