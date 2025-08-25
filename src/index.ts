import * as yaml from "yaml"

import * as env from "env"
import * as types from "types"
import * as templetes from "templetes"

type Main = (args: string[]) => Promise<never>

// Entry
type IntegrateShell = (args: string[]) => Promise<void>
type CheckCmdExist = (args: string[]) => Promise<void>
type ExtractText = (args: string[]) => Promise<void>
type ExtractCommand = (args: string[]) => Promise<void>
type Ask = (args: string[]) => Promise<void>

// Dirty
type AskDebug = (question: string) => Promise<string>
type AskAi = (question: string, config: types.Config, envVars: env.EnvVar[]) => Promise<string>
type GetConfig = () => Promise<types.Config>
type RotateThenGetCache = (newMessages: types.Message[]) => Promise<types.Message[]>

// Pure
type BuildRequest = (question: string, cache: types.Message[], config: types.Config, envVars: env.EnvVar[]) => Promise<types.Request>
type BuildRequestBody = (question: string, cache: types.Message[], config: types.Config, envVars: env.EnvVar[]) => Promise<types.RequestBoby>
type BuildMessages = (question: string, cache: types.Message[], config: types.Config, envVars: env.EnvVar[]) => Promise<types.Message[]>
type BuildSystemPrompt = (config: types.Config, envVars: env.EnvVar[]) => Promise<string>
type BuildEnvVarsPart = (envVars: env.EnvVar[]) => Promise<string>
type ParseResponseAnthropic = (result: types.ResponseResultAnthropic) => Promise<string>
type ParseResponseOpenai = (result: types.ResponseResultOpenai) => Promise<string>
type Sleep = (ms: number) => Promise<void>
type ArgsToText = (args: string[]) => Promise<string>
type IsCmdExists = (text: string) => Promise<boolean>
type SplitTextAndCmd = (answer: string) => Promise<[string, string]>
type FilterResponseText = (text: string) => Promise<string>


const main: Main = async (args) => {
    const subCommand = args.at(0)
    const restArgs = args.slice(1)
    if (restArgs.length <= 0) process.exit()
    else if (subCommand === "integrate-shell") await integrateShell(restArgs)
    else if (subCommand === "check-cmd-exist") await checkCmdExist(restArgs)
    else if (subCommand === "extract-text") await extractText(restArgs)
    else if (subCommand === "extract-cmd") await extractCommand(restArgs)
    else if (subCommand === "ask") await ask(restArgs)
    process.exit()
}

const integrateShell: IntegrateShell = async (args) => {
    const shellText =
        args.at(0)
            .trim()
            .toLowerCase()
    const shell = shellText === "" ? "<undefined>" : shellText
    const isExeFile = env.getIsExeFile()
    const path = env.getExePathOrSrcDir()
    const shellFunc = templetes.buildShellFunction(shell, isExeFile, path)
    console.log(shellFunc)
}

const checkCmdExist: CheckCmdExist = async (args) => {
    const answer = await argsToText(args)
    await isCmdExists(answer) ? console.log("true") : console.log("false")
}

const extractText: ExtractText = async (args) => {
    const answer = await argsToText(args)
    const textAndCmd = await splitTextAndCmd(answer)
    const text = textAndCmd.at(0)
    console.log(text)
}

const extractCommand: ExtractCommand = async (args) => {
    const answer = await argsToText(args)
    const textAndCmd = await splitTextAndCmd(answer)
    const cmd = textAndCmd.at(1)
    console.log(cmd)
}

const ask: Ask = async (args) => {
    const question = await argsToText(args)
    const config = await getConfig()
    const envVars = env.getEnvVars(config.env_access.env_vars)
    if (config.debug) {
        const answer = await askDebug(question)
        console.log(answer)
    }
    else {
        const answer = await askAi(question, config, envVars)
        console.log(answer)
    }
}

const askDebug: AskDebug = async (question) => {
    const dummyAnswer = templetes.buildDummyAnswer(question)
    await sleep(1000)
    return dummyAnswer
}

const askAi: AskAi = async (question, config, envVars) => {
    const apiType = config.api.type
    const cache = await rotateThenGetCache([])
    const request = await buildRequest(question, cache, config, envVars)
    const response = await fetch(config.api.url, request)
    const result = await response.json()
    if (apiType === "anthropic") {
        const rawText = await parseResponseAnthropic(result as types.ResponseResultAnthropic)
        const text = await filterResponseText(rawText)
        const messages: types.Message[] = [
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
        return text
    } else if (apiType === "openai") {
        const rawText = await parseResponseOpenai(result as types.ResponseResultOpenai)
        const text = await filterResponseText(rawText)
        const messages: types.Message[] = [
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
        return text
    } else {
        const text = `暂时还不支持${apiType}这种API喵`
        return text
    }
}

const getConfig: GetConfig = async () => {
    const configDir = env.getWorkingDir()
    const configPath = `${configDir}/config.yaml`
    const configFile = Bun.file(configPath)
    const configText = await configFile.text()
    const config = yaml.parse(configText) as types.Config
    return config
}

const rotateThenGetCache: RotateThenGetCache = async (newMessages) => {
    const cacheDir = env.getWorkingDir()
    const cachePath = `${cacheDir}/cache.json`
    const cacheFile = Bun.file(cachePath)
    const newMessagesStr = JSON.stringify(newMessages, undefined, "  ")
    if (!await cacheFile.exists()) {
        await cacheFile.write(newMessagesStr)
        return newMessages
    }
    const cache = await cacheFile.json() as types.Message[]
    if (cache.length <= 0 || cache.at(-1).content === templetes.terminateMessage) {
        await cacheFile.write(newMessagesStr)
        return newMessages
    }
    const rotatedCache = cache.slice(- (10 - 1) * 2)
    const newCache = [...rotatedCache, ...newMessages]
    const newCacheStr = JSON.stringify(newCache, undefined, "  ")
    await cacheFile.write(newCacheStr)
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
    const messages = await buildMessages(question, cache, config, envVars)
    const body = {
        model: config.api.model,
        messages: messages
    }
    return body
}

const buildMessages: BuildMessages = async (question, cache, config, envVars) => {
    const systemPrompt = await buildSystemPrompt(config, envVars)
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

const buildSystemPrompt: BuildSystemPrompt = async (config, envVars) => {
    const envVarsPart = await buildEnvVarsPart(envVars)
    const systemPrompt = templetes.buildSystemPromptString(envVarsPart)
    return systemPrompt
}

const buildEnvVarsPart: BuildEnvVarsPart = async (envVars) => {
    const envVarsLine = envVars.map(envVar => `${envVar.name}: ${envVar.value}`)
    const envVarsPart = envVarsLine.join("\n")
    return envVarsPart
}

const parseResponseAnthropic: ParseResponseAnthropic = async (result) => {
    const text = result.content.at(0).text
    return text
}

const parseResponseOpenai: ParseResponseOpenai = async (result) => {
    const text = result.choices.at(0).message.content
    return text
}

const sleep: Sleep = async (ms) =>
    await new Promise(resolve => setTimeout(() => resolve(), ms))

const argsToText: ArgsToText = async (args) =>
    args
        .join(" ")
        .replaceAll("\\n", "\n")
        .trim()

const filterResponseText: FilterResponseText = async (text) => {
    const trimmedText = text.trim()
    if (trimmedText.startsWith(templetes.qwqMetaTerminateId)
        || trimmedText.endsWith(templetes.qwqMetaTerminateId))
        return templetes.terminateMessage
    return trimmedText
}

const isCmdExists: IsCmdExists = async (text) => {
    const lastBeginIdIndex = text.lastIndexOf(templetes.qwqCommandBeginId)
    const lastEndIdIndex = text.lastIndexOf(templetes.qwqCommandEndId)
    if (lastBeginIdIndex === -1 || lastEndIdIndex === -1) return false
    else if (lastBeginIdIndex > lastEndIdIndex) return false
    else return true
}

const splitTextAndCmd: SplitTextAndCmd = async (answer) => {
    const cmdExists = await isCmdExists(answer)
    if (!cmdExists) return [answer.trim(), ""]
    const answerSplitedByBeginId = answer.split(templetes.qwqCommandBeginId)
    const text =
        answerSplitedByBeginId
            .slice(0, -1)
            .join(templetes.qwqCommandBeginId)
            .trim()
    const command =
        answerSplitedByBeginId
            .at(-1)
            .split(templetes.qwqCommandEndId)
            .at(0)
            .trim()
    return [text, command]
}

if (import.meta.main) main(Bun.argv.slice(2))