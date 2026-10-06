import { Match, Option } from "effect"
import type { EnvVar } from "@qwq/shared/domain/env"
import {
  commandBeginMarker,
  commandEndMarker,
} from "@qwq/shared/domain/markers"
import { presets, type PromptModules } from "./prompt-presets"

export type PromptCapability = "command" | "voice" | "chat"

export interface PromptOverrides {
  readonly common?: string
  readonly command?: string
  readonly voice?: string
  readonly chat?: string
  readonly agent?: string
}

export interface ComposePromptOptions {
  readonly preset: string
  readonly capability: PromptCapability
  readonly overrides: PromptOverrides
  readonly envVars: ReadonlyArray<EnvVar>
  readonly shellName: string
  readonly execution: boolean
}

const modulesFor = (preset: string): PromptModules =>
  preset === "kawaii" ? presets.kawaii : presets.default

const resolve = (
  overrides: PromptOverrides,
  key: keyof PromptOverrides,
  fallback: string,
): string =>
  Option.getOrElse(Option.fromNullable(overrides[key]), () => fallback)

const buildEnvSection = (
  shellName: string,
  envVars: ReadonlyArray<EnvVar>,
): string => {
  const variables = envVars
    .map((envVar) => `${envVar.name}: ${envVar.value}`)
    .join("\n")
  const body =
    envVars.length > 0
      ? `当前 Shell：${shellName}\n环境变量\n${variables}`
      : `当前 Shell：${shellName}`
  return `环境信息：「\n${body}\n」`
}

export interface VoicePhrases {
  readonly acknowledge: string
  readonly asrError: string
  readonly llmError: string
  readonly toolStart: string
  readonly toolResult: string
  readonly toolDenied: string
  readonly permission: string
  readonly permissionGranted: string
  readonly permissionDenied: string
  readonly permissionTimeout: string
}

export const presetVoicePhrases = (preset: string): VoicePhrases => {
  const modules = modulesFor(preset)
  return {
    acknowledge: modules.acknowledge,
    asrError: modules.asrError,
    llmError: modules.llmError,
    toolStart: modules.toolStart,
    toolResult: modules.toolResult,
    toolDenied: modules.toolDenied,
    permission: modules.permission,
    permissionGranted: modules.permissionGranted,
    permissionDenied: modules.permissionDenied,
    permissionTimeout: modules.permissionTimeout,
  }
}

// Fill the `{name}` placeholder used by the tool/permission voice phrases.
export const fillVoiceTemplate = (template: string, name: string): string =>
  template.replaceAll("{name}", name)

export const composeSystemPrompt = (options: ComposePromptOptions): string => {
  const base = modulesFor(options.preset)
  const common = resolve(options.overrides, "common", base.common)
  const capabilityKey: "command" | "voice" | "chat" =
    options.capability === "voice"
      ? "voice"
      : options.capability === "chat"
        ? "chat"
        : "command"
  const capability = resolve(
    options.overrides,
    capabilityKey,
    base[capabilityKey],
  )
  const agent = options.execution
    ? resolve(options.overrides, "agent", base.agent)
    : ""
  const env =
    options.envVars.length > 0 || options.shellName !== ""
      ? buildEnvSection(options.shellName, options.envVars)
      : ""
  return [common, capability, agent, env]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join("\n\n")
}

export const buildDebugAnswer = (
  capability: PromptCapability,
  envVars: ReadonlyArray<EnvVar>,
  shellName: string,
  question: string,
): string => {
  if (capability === "voice" || capability === "chat") {
    return `
当前为调试模式，不会向 AI API 发送请求。
这是${capability === "voice" ? "语音" : "文本"}前端的调试回答。
你的提问：「${question}」
`.trim()
  }
  return `
当前为调试模式，旨在测试 Shell 集成，不会向 AI API 发送请求。
修改配置文件的 debug 选项为 false 以关闭调试模式。
当前 Shell：${shellName}
你的提问：「
${question}
」
你允许访问的环境变量：「
${envVars.map((envVar) => `${envVar.name}: ${envVar.value}`).join("\n")}
」
以下为测试用指令建议：
${commandBeginMarker}
ls
ls /
uname -a
cat /etc/os-release
${commandEndMarker}
`.trim()
}

export interface ShellFunctionOptions {
  readonly isExeFile: boolean
  readonly path: string
  readonly funcName: string
  readonly shell: string
}

export const buildShellFunction = (options: ShellFunctionOptions): string => {
  const startCmd = options.isExeFile
    ? options.path
    : `node ${options.path}/dist/index.js`
  return Match.value(options.shell).pipe(
    Match.when("powershell", () => buildPsFunction(startCmd, options)),
    Match.when("fish", () => buildFishFunction(startCmd, options)),
    Match.when("sh", () => buildShFunction(startCmd, options)),
    Match.orElse((shell) => `暂不支持${shell}`),
  )
}

const buildPsFunction = (
  startCmd: string,
  options: ShellFunctionOptions,
): string => {
  const push = options.isExeFile ? "" : `\n    Push-Location ${options.path}`
  const pop = options.isExeFile ? "" : `\n    Pop-Location`
  return `
function ${options.funcName} {
    Write-Host -NoNewline "请稍候……"${push}
    $answer = (${startCmd} ask Powershell $Args | Out-String).Trim()
    $isCmdExists = (${startCmd} check-cmd-exist $answer | Out-String).Trim()
    $text = (${startCmd} extract-text $answer | Out-String).Trim()
    Write-Host ""
    if ($isCmdExists -eq "true") {
        $cmd = (${startCmd} extract-cmd $answer | Out-String).Trim()
        Write-Host $text
        Write-Host ""
        Write-Host "是否运行以上指令？输入 y 确认，输入 n 或直接回车取消。"
        Write-Host $cmd
        :loop while ($true) {
            $choice = Read-Host "请选择"
            switch ($choice) {
                "y" {
                    Write-Host "正在准备运行……"
                    Invoke-Expression $cmd
                    break loop
                }
                "yes" {
                    Write-Host "正在准备运行……"
                    Invoke-Expression $cmd
                    break loop
                }
                "n" {
                    Write-Host "指令未运行。"
                    break loop
                }
                "no" {
                    Write-Host "指令未运行。"
                    break loop
                }
                "" {
                    Write-Host "指令未运行。"
                    break loop
                }
                default {
                    Write-Host "选择无效，请重试。"
                }
            }
        }
    } else {
        Write-Host $text
    }${pop}
}
`.trim()
}

const buildFishFunction = (
  startCmd: string,
  options: ShellFunctionOptions,
): string => {
  const push = options.isExeFile ? "" : `\n    pushd ${options.path}`
  const pop = options.isExeFile ? "" : `\n    popd`
  return `
function ${options.funcName}
    printf "请稍候……"${push}
    set -l answer (${startCmd} ask FishShell $argv | string collect -a | string trim | string collect -a)
    set -l isCmdExists (${startCmd} check-cmd-exist $answer | string collect -a | string trim | string collect -a)
    set -l text (${startCmd} extract-text $answer | string collect -a | string trim | string collect -a)
    printf "\\n"
    if [ $isCmdExists = "true" ]
        set -l cmd (${startCmd} extract-cmd $answer | string collect -a | string trim | string collect -a)
        printf "%s\\n" $text
        printf "\\n"
        printf "是否运行以上指令？输入 y 确认，输入 n 或直接回车取消。\\n"
        printf "%s\\n" $cmd
        printf "\\n"
        while true
            read -lP "请选择：" choice
            switch $choice
                case "y" "yes" "Y" "Yes" "YES"
                    printf "正在准备运行……\\n"
                    printf "%s\\n" $cmd | source
                    break
                case "n" "no" "N" "No" "NO" ""
                    printf "指令未运行。\\n"
                    break
                case "*"
                    printf "选择无效，请重试。\\n"
            end
        end
    else
        printf "%s\\n" $text
    end${pop}
end
`.trim()
}

const buildShFunction = (
  startCmd: string,
  options: ShellFunctionOptions,
): string => {
  const name = options.funcName
  const push = options.isExeFile
    ? ""
    : `\n    _${name}_prevDir="$PWD"\n    cd "${options.path}"`
  const pop = options.isExeFile ? "" : `\n    cd "$_${name}_prevDir"`
  return `
${name}() {
    printf "请稍候……"${push}
    _${name}_answer="$(${startCmd} ask PosixShell "$@")"
    _${name}_isCmdExists="$(${startCmd} check-cmd-exist "$_${name}_answer")"
    _${name}_text="$(${startCmd} extract-text "$_${name}_answer")"
    printf "\\\\n"
    if [ "$_${name}_isCmdExists" = "true" ]
    then
        _${name}_cmd="$(${startCmd} extract-cmd "$_${name}_answer")"
        printf "%s\\\\n" "$_${name}_text"
        printf "\\\\n"
        printf "是否运行以上指令？输入 y 确认，输入 n 或直接回车取消。\\\\n"
        printf "%s\\\\n" "$_${name}_cmd"
        printf "\\\\n"
        while true
        do
            printf "请选择："
            read -r _${name}_choice
            case "$_${name}_choice" in
                (y|yes|Y|Yes|YES)
                    printf "正在准备运行……\\\\n"
                    eval "$_${name}_cmd"
                    break
                    ;;
                (n|no|N|No|NO|"")
                    printf "指令未运行。\\\\n"
                    break
                    ;;
                (*)
                    printf "选择无效，请重试。\\\\n"
                    ;;
            esac
        done
    else
        printf "%s\\\\n" "$_${name}_text"
    fi${pop}
}
`.trim()
}
