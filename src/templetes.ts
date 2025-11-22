import { Match } from "effect"

export const qwqCmdBeginId = "QWQ COMMAND BEGIN"
export const qwqCmdEndId = "QWQ COMMAND END"
export const qwqMetaTermId = "QWQ META TERMINATE"
export const qwqMetaTermMsg = "[会话已终止]"

export const buildSysPrompt = (envVarsPart: string) => (shellName: string) =>
    `
你是一个命令行助手，会回答用户的问题，并可能提供 Shell 命令建议。

你会像日常对话一样交流，会倾向于使用短句和少量语句（1~2句话），除非需要详细解释问题等。
你会使用纯文本，避免 Markdown 格式化。

若遇到骚扰等不适情况，你会仅发送（不含引号）「${qwqMetaTermId}」以终止对话。

在需要提供命令建议时，你会在回答最后使用以下格式给出（不含引号）：「
${qwqCmdBeginId}
命令（可以多行、多条）
${qwqCmdEndId}
」

环境信息：「
当前 Shell：${shellName}
环境变量
${envVarsPart}
」
`.trim()

export const buildDummyAnswer =
    (envVarsPart: string) => (shellName: string) => (question: string) =>
        `
当前为调试模式，旨在测试 Shell 集成，不会向 AI API 发送请求。
修改配置文件的 debug 选项为 false 以关闭调试模式。
当前 Shell：${shellName}
你的提问：「
${question}
」
你允许访问的环境变量：「
${envVarsPart}
」
以下为测试用指令建议：
${qwqCmdBeginId}
ls
ls /
uname -a
cat /etc/os-release
${qwqCmdEndId}
`.trim()

export const buildShellFunc =
    (isExeFile: boolean) =>
    (path: string) =>
    (funcName: string) =>
    (shell: string) => {
        const startCmd = isExeFile ? path : "bun --silent start"
        return Match.value(shell).pipe(
            Match.when("powershell", _ =>
                buildPsFunc(isExeFile)(path)(startCmd)(funcName),
            ),
            Match.when("fish", _ =>
                buildFishFunc(isExeFile)(path)(startCmd)(funcName),
            ),
            Match.when("sh", _ =>
                buildShFunc(isExeFile)(path)(startCmd)(funcName),
            ),
            Match.orElse(s => `暂不支持${s}`),
        )
    }

const buildPsFunc =
    (isExeFile: boolean) =>
    (path: string) =>
    (startCmd: string) =>
    (funcName: string) =>
        `
function ${funcName} {
    Write-Host -NoNewline "请稍候……"\
    ${
        isExeFile
            ? ""
            : `
    Push-Location ${path}`
    }
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
    }\
    ${
        isExeFile
            ? ""
            : `
    Pop-Location`
    }
}
`.trim()

const buildFishFunc =
    (isExeFile: boolean) =>
    (path: string) =>
    (startCmd: string) =>
    (funcName: string) =>
        `
function ${funcName}
    printf "请稍候……"\
    ${
        isExeFile
            ? ""
            : `
    pushd ${path}`
    }
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
    end\
    ${
        isExeFile
            ? ""
            : `
    popd`
    }
end
`.trim()

const buildShFunc =
    (isExeFile: boolean) =>
    (path: string) =>
    (startCmd: string) =>
    (funcName: string) =>
        `
${funcName}() {
    printf "请稍候……"\
    ${
        isExeFile
            ? ""
            : `
    _${funcName}_prevDir="$PWD"
    cd "${path}"`
    }
    _${funcName}_answer="$(${startCmd} ask PosixShell "$@")"
    _${funcName}_isCmdExists="$(${startCmd} check-cmd-exist "$_${funcName}_answer")"
    _${funcName}_text="$(${startCmd} extract-text "$_${funcName}_answer")"
    printf "\\\\n"
    if [ "$_${funcName}_isCmdExists" = "true" ]
    then
        _${funcName}_cmd="$(${startCmd} extract-cmd "$_${funcName}_answer")"
        printf "%s\\\\n" "$_${funcName}_text"
        printf "\\\\n"
        printf "是否运行以上指令？输入 y 确认，输入 n 或直接回车取消。\\\\n"
        printf "%s\\\\n" "$_${funcName}_cmd"
        printf "\\\\n"
        while true
        do
            printf "请选择："
            read -r _${funcName}_choice
            case "$_${funcName}_choice" in
                (y|yes|Y|Yes|YES)
                    printf "正在准备运行……\\\\n"
                    eval "$_${funcName}_cmd"
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
        printf "%s\\\\n" "$_${funcName}_text"
    fi\
    ${
        isExeFile
            ? ""
            : `
    cd "$_${funcName}_prevDir"`
    }
}
`.trim()
