# QwQ

与终端无缝集成的 AI 助理

## 特性

### 问答

```text
lialh4@lialh4-pc /m/h/l/P/qwq (main)> qwq deepseek和qwen是什么
请稍候……
DeepSeek和Qwen都是大型语言模型。

DeepSeek由深度求索公司开发，Qwen由阿里巴巴开发。它们都能理解和生成自然语言。
```

### 指令建议

```text
lialh4@lialh4-pc /m/h/l/P/qwq (main)> qwq 我的内核版本是什么
请稍候……
你可以用 uname -r 命令查看内核版本。

是否运行以上指令？输入 y 确认，输入 n 或直接回车取消。
uname -r

请选择：y
正在准备运行……
6.17.7-200.fc42.x86_64
```

## 安装

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

## 配置

1. 填写配置文件中的 API TYPE、API URL 和 API KEY (Token) 以及模型选择部分

    目前理论上支持所有兼容 Antoropic 或 OpenAI 格式的 API。

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
            - XDG_SESSION_TYPE
            - XDG_SESSION_DESKTOP
    ```

## 启用 Shell 集成

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

## 开始使用

在终端中输入 `qwq <问题>` 即可对话。

## 未来展望

- [x] 支持常见 API 格式
- [x] 支持获取系统环境变量信息
- [x] 支持记忆（连续对话）功能
- [x] 支持 POSIX SHELL (Bash、Zsh、etc...) 集成
- [ ] 支持多语言
- [ ] 支持视觉模型
