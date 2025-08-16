import * as yaml from "yaml"
import * as types from "types"

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
type GetEnvVars = (config: types.Config) => Promise<string>

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
    if (shell === "fish") {
        const script = `function qwq
    printf "在想呢……"
    cd ${dir}
    set -l answer (bun --silent start ask $argv | string collect | string trim)
    set -l command (bun --silent start extract-cmd $answer | string collect | string trim)
    if [ $command != "" ]
        set -l answerText (string split -rm 1 \\n"QWQ COMMAND BEGIN" $answer)[1]
        printf "\\n"
        printf "%s\\n" $answerText
        printf "要运行这些指令吗？输入 y 确认，输入 n 或者直接按回车取消~\\n"
        printf "$command\\n"
        while true
            read -lP "你的选择：" confirm
            switch $confirm
                case "y" "yes" "Y" "Yes" "YES"
                    printf "好耶！\\n"
                    printf "$command\\n" | source
                    break
                case "n" "no" "N" "No" "NO"
                    printf "指令没有执行哦~\\n"
                    break
                case "*"
                    printf "我不太能看懂你的选择呢……\\n"
            end
        end
    else
        printf "\\n"
        printf "%s\\n" $answer
    end
    prevd
end`
        console.log(script)
    } else if (shell === "powershell") {
        const script = `function qwq {
    Write-Host -NoNewline "在想呢……"    
    Push-Location ${dir}
    $answer = (bun --silent start ask $Args | Out-String).Trim()
    $command = (bun --silent start extract-cmd $answer | Out-String).Trim()
    if ($command) {
        $answerText = ($answer -split "\`nQWQ COMMAND BEGIN", -2)[0]
        Write-Host ""
        Write-Host $answerText
        Write-Host "要运行这些指令吗？输入 y 确认，输入 n 或者直接按回车取消~"
        Write-Host $command
        :loop while ($true) {
            $confirm = Read-Host "你的选择"
            switch ($confirm) {
                "y" {
                    Write-Host "好耶！"
                    Invoke-Expression $command
                    break loop
                }
                "yes" {
                    Write-Host "好耶！"
                    Invoke-Expression $command
                    break loop
                }
                "n" {
                    Write-Host "指令没有执行哦~"
                    break loop
                }
                "no" {
                    Write-Host "指令没有执行哦~"
                    break loop
                }
                default {
                    Write-Host "我不太能看懂你的选择呢……"
                }
            }
        }
    } else {
        Write-Host ""
        Write-Host $a   nswer
    }
    Pop-Location
}`
        console.log(script)
    } else {
        const message = `暂时不支持${shell}喵`
        console.log(message)
    }
}

const extractCommand: ExtractCommand = async (answer) => {
    if (!(answer.includes("QWQ COMMAND BEGIN") && answer.includes("QWQ COMMAND END"))) {
        console.log("")
    } else {
        const afterBeginId = answer.split("QWQ COMMAND BEGIN").at(-1)
        const command = afterBeginId.split("QWQ COMMAND END").at(0).trim()
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
    const dummyAnswer = `现在是调试模式喵~
就是……不会真正向AI提问的
你提出的问题是：${question}
我在调试模式下回答不了呢
把配置文件里的debug改成false就能关掉调试模式了喵
下面是一条指令建议的实例，用于测试shell集成是否正常喵
QWQ COMMAND BEGIN
uname -a
ls /
cat /etc/os-release
QWQ COMMAND END`
    await new Promise(resolve => setTimeout(() => resolve(null), 3000))
    console.log(dummyAnswer)
}

const askAi: AskAi = async (question, config) => {
    const request = await buildRequest(question, config)
    const response = await fetch(config.api.url, request)
    const result = await response.json() as types.ResponseResult
    console.log(result.content.at(0).text)
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
    const systemPromptFile = Bun.file("./system-prompt.txt")
    const rawSystemPrompt = await systemPromptFile.text()
    const envVars = await getEnvVars(config)
    const systemPrompt = `${rawSystemPrompt}\n以下是用户提供给你的一些环境变量，请在回答前参考，如根据用户所用的Shell来推荐正确的指令：\n${envVars}`
    return systemPrompt
}

const getEnvVars: GetEnvVars = async (config) => {
    const envVars = config.env_access.env_vars.map(envVar => {
        const value = Bun.env[envVar]
        if (value === undefined) return `${envVar}: <undefined>`
        return `${envVar}: ${value}`
    }).join("\n")
    return envVars
}

if (import.meta.path === Bun.main) main(Bun.argv.slice(2))