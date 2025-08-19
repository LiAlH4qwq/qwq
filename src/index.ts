import * as yaml from "yaml"
import * as types from "types"
import * as templetes from "templetes"

type Main = (args: string[]) => Promise<never>
type ShellIntegrate = (shell: string) => Promise<void>
type ExtractCommand = (answer: string) => Promise<void>
type LoadConfig = () => Promise<types.Config>
type Ask = (question: string) => Promise<void>
type AskDebug = (question: string) => Promise<void>
type AskAi = (question: string, config: types.Config) => Promise<void>
type BuildRequest = (question: string, config: types.Config) => Promise<types.Request>
type BuildRequestBody = (question: string, config: types.Config) => Promise<types.RequestBoby>
type BuildMessages = (question: string, config: types.Config) => Promise<types.Message[]>
type BuildSystemPrompt = (config: types.Config) => Promise<string>
type GetEnvVarsPart = (config: types.Config) => Promise<string>
type ParseResponseAnthropic = (result: types.ResponseResultAnthropic) => Promise<string>
type ParseResponseOpenai = (result: types.ResponseResultOpenai) => Promise<string>
type ParseResponseText = (rawText: string) => Promise<string>

const main: Main = async (args) => {
    const command = args.at(0)
    const text = args.slice(1).join(" ").replaceAll("\\n", "\n")
    if (command === "ask") await ask(text)
    else if (command === "extract-cmd") await extractCommand(text)
    else if (command === "integrate-shell") await shellIntegrate(args.length >= 2 ? args.at(1).trim() : "<undefined>")
    process.exit()
}

const shellIntegrate: ShellIntegrate = async (shell) => {
    const dir = import.meta.dir
    if (shell === "fish") console.log(templetes.buildFishFunction(dir))
    else if (shell === "powershell") console.log(templetes.buildPowershellFunction(dir))
    else console.log(`暂时还不支持${shell}喵~`)
}

const extractCommand: ExtractCommand = async (answer) => {
    if (!(answer.includes(templetes.qwqCommandBeginId) && answer.includes(templetes.qwqCommandEndId))) {
        console.log("")
    } else {
        const afterBeginId = answer.split(templetes.qwqCommandBeginId).at(-1)
        const command = afterBeginId.split(templetes.qwqCommandEndId).at(0).trim()
        console.log(command)
    }
}

const loadConfig: LoadConfig = async () => {
    const configFile = Bun.file("./config.yaml")
    const config = yaml.parse(await configFile.text()) as types.Config
    return config
}

const ask: Ask = async (question) => {
    const config = await loadConfig()
    if (config.debug) await askDebug(question)
    else await askAi(question, config)
}

const askDebug: AskDebug = async (question) => {
    const dummyAnswer = templetes.buildDummyAnswer(question)
    await new Promise(resolve => setTimeout(() => resolve(null), 3000))
    console.log(dummyAnswer)
}

const askAi: AskAi = async (question, config) => {
    const request = await buildRequest(question, config)
    const response = await fetch(config.api.url, request)
    const result = await response.json()
    if (config.api.type === "anthropic") {
        const rawText = await parseResponseAnthropic(result as types.ResponseResultAnthropic)
        const text = await parseResponseText(rawText)
        console.log(text)
    } else if (config.api.type === "openai") {
        const rawText = await parseResponseOpenai(result as types.ResponseResultOpenai)
        const text = await parseResponseText(rawText)
        console.log(text)
    } else {
        console.log(`暂时还不支持${config.api.type}这种API喵`)
    }
}

const buildRequest: BuildRequest = async (question, config) => {
    const headers = new Headers()
    headers.append("Authorization", `Bearer ${config.api.key}`)
    headers.append("Content-Type", "application/json")
    const body = await buildRequestBody(question, config)
    const request = {
        method: "POST" as "POST",
        headers: headers,
        body: JSON.stringify(body)
    }
    return request
}

const buildRequestBody: BuildRequestBody = async (question, config) => {
    const messages = await buildMessages(question, config)
    const body = {
        model: config.api.model,
        messages: messages
    }
    return body
}

const buildMessages: BuildMessages = async (question, config) => {
    const systemPrompt = await buildSystemPrompt(config)
    const systemMessage = {
        role: "system" as "system",
        content: systemPrompt
    }
    const questionMessage = {
        role: "user" as "user",
        content: question
    }
    const messages = [systemMessage, questionMessage]
    return messages
}

const buildSystemPrompt: BuildSystemPrompt = async (config) => {
    const envVarsPart = await getEnvVarsPart(config)
    const systemPrompt = templetes.buildSystemPromptString(envVarsPart)
    return systemPrompt
}

const getEnvVarsPart: GetEnvVarsPart = async (config) => {
    const envVarsPart = config.env_access.env_vars.map(envVar => {
        const value = Bun.env[envVar]
        if (value === undefined) return `${envVar}: <undefined>`
        return `${envVar}: ${value}`
    }).join("\n")
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

const parseResponseText: ParseResponseText = async (rawText) => {
    const trimmedRawText = rawText.trim()
    if (trimmedRawText.startsWith(templetes.qwqMetaTerminateId)
        || trimmedRawText.endsWith(templetes.qwqMetaTerminateId))
        return templetes.terminateMessage
    else return trimmedRawText
}

if (import.meta.path === Bun.main) main(Bun.argv.slice(2))