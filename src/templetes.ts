type BuildFishFunction = (dir: string) => string
type BuildPowershellFunction = (dir: string) => string

export const buildFishFunction: BuildFishFunction = (dir) => `
function qwq
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
end
`.trim()

export const buildPowershellFunction: BuildPowershellFunction = (dir) => `
function qwq {
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
}
`.trim()