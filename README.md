# QwQ

命令行中的AI伴侣！

## 她可以……

### 聊天

```text
lialh4@LiAlH4-Laptop ~> qwq 请问你喜欢吃什么呀？
在想呢……
(开心地笑) 我最喜欢吃草莓蛋糕啦~软软的奶油配酸甜草莓最棒了！
```

### 帮忙查询指令

```text
lialh4@LiAlH4-Laptop ~> qwq 请问我应该怎么查看系统内核信息呀？
在想呢……
（歪头思考）最简单的办法是用uname命令哦！

要运行这些指令吗？输入 y 确认，输入 n 或者直接按回车取消~
uname -a
你的选择：y
好耶！
Linux LiAlH4-Laptop 6.12.0-160000.20-default #1 SMP PREEMPT_DYNAMIC Mon Jul 21 10:20:07 UTC 2025 (b00eabe) x86_64 x86_64 x86_64 GNU/Linux
```

还有更多哦

## 怎么安装呢？

### 二进制安装

1. 从 [CI 页面](https://github.com/LiAlH4qwq/qwq/actions) 下载最新的二进制文件压缩包

    一般情况下：

    Linux 用户请下载 `qwq-linux-x64`

    MacOS 用户请下载 `qwq-darwin-arm64`

    Windows 用户请下载 `qwq-windows-x64`

1. 解压压缩包中的可执行文件到特定位置

    尽量避免后续移动可执行文件，因为这意味着要重新配置 Shell 集成

1. 在可执行文件同级目录创建一个 `config.yaml` 文件，并复制 [示例配置文件](https://raw.githubusercontent.com/LiAlH4qwq/qwq/refs/heads/main/config.example.yaml) 内容到此文件，以便后续进行配置

### 从源码安装

1. 安装 bun

    可参考 [官网首页](https://bun.sh/)

1. 克隆项目

    > git clone <https://github.com/lialh4qwq/qwq>
    >
    > cd qwq

1. 复制示例配置文件

    > cp config.example.yaml config.yaml

## 配置怎么办呢？

1. 填写配置文件中的 API TYPE、API URL 和 API KEY (Token) 以及模型选择部分

    目前理论上支持所有兼容 Antoropic 或 OpenAI 格式的 API，但目前只测试了 [硅基流动](https://siliconflow.cn/) 和 Ollama

    例如：

    ```yaml
    api:
        type: anthropic
        url: https://api.siliconflow.cn/v1/messages
        key: YOUR_API_TOKEN
        model: deepseek-ai/DeepSeek-V3
    ```

1. （可选）添加更多环境变量访问权限

    在 env_access.env_vars 列表中新增项目

    例如：

    ```yaml
    env_access:
        env_vars:
            - SHELL
            - USER
            - XDG_SESSION_TYPE
            - XDG_SESSION_DESKTOP
    ```

## 别忘了启用 Shell 集成~

请在二进制文件所在目录或克隆的项目目录中执行下文中的操作

启用 Shell 集成后，即可在任何目录下向 AI 提问

若通过二进制安装，请替换下文中 `<启动指令>` 为 `./<二进制文件名>`

若通过源码安装，请替换下文中 `<启动指令>` 为 `bun start`

### Powershell

- Linux 用户

    > mkdir ~/.config/powershell
    >
    > <启动指令> integrate-shell powershell > ~/.config/powershell/Microsoft.PowerShell_profile.ps1

- Windows 用户

    运行以下指令并粘贴输出到 Powershell Profile 中

    > <启动指令> integrate-shell powershell

### Fish Shell

> <启动指令> integrate-shell fish > ~/.config/fish/conf.d/qwq.fish

### Posix Shell (Bash / Dash / Zsh / etc.)

运行以下指令并粘贴输出到你的 Shell Profile （如 `~/.bashrc`、`~/.zshrc`）中

> <启动指令> integrate-shell sh

## 然后……

然后就可以在命令行中输入 `qwq <想问的东西>` 来对话啦！

## 画大饼（bushi）

- [x] 支持常见 API 格式
- [x] 支持获取系统环境变量信息
- [x] 支持记忆（连续对话）功能
- [x] 支持 POSIX SHELL (Bash、Zsh、etc...) 集成
- [ ] 支持推理模型
- [ ] 支持图文生文模型
