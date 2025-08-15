# QwQ

在命令行中的AI伴侣！

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

### 从源码安装

1. 安装 bun，可参考 [官网首页](https://bun.sh/)
1. 克隆项目

    > git clone <https://github.com/lialh4qwq/qwq>
    > cd qwq

1. 启用 shell 集成（暂时只支持 fish shell 哦）

    > bun start integrate-shell fish > ~/.config/fish/conf.d/qwq.fish

### 二进制安装

目前还没做好呢……

## 配置怎么办呢？

1. 复制 config.yaml.example 为 config.yaml

    > cp config.yaml.example config.yaml

1. 填写其中的 API URL 和 API KEY (Token) 以及模型选择部分

    目前只支持 Anthropic API 格式，只测试了 [硅基流动](https://siliconflow.cn/) qaq

    ```yaml
    api:
        type: anthropic
        url: https://api.siliconflow.cn/v1/messages
        key: YOUR_API_TOKEN
        model: deepseek-ai/DeepSeek-V3
    ```

1. （可选）添加更多环境变量访问权限

    在 env_access.env_vars 列表中新增项目

    ```yaml
    env_access:
        env_vars:
            - SHELL
    ```

然后就可以在命令行中输入 qwq <问句> 来对话啦！

## 画大饼（bushi

- [ ] 支持 POSIX SHELL (Bash、Zsh、etc...) 集成
- [ ] 支持更多 api 提供商
- [ ] 支持获取更多系统环境信息
