import {
  ApiKeyError,
  AsrError,
  AudioError,
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
  LlmRequestError,
  LlmResponseError,
  KwsError,
  RemoteAskError,
  ServerStartError,
  ServerUnavailableError,
  SessionNotFoundError,
  SessionReadError,
  SessionWriteError,
  TtsError,
  UsageError,
  VoiceConfigError,
} from "./errors"

export { version } from "./version"

const bullet = (items: ReadonlyArray<string>): string =>
  items.map((issue) => `  - ${issue}`).join("\n")

const causeMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

export const formatDiagnostic = (error: unknown): string => {
  if (error instanceof UsageError) {
    return error.message
  }
  if (error instanceof ConfigReadError) {
    return `无法读取配置文件：\n  path: ${error.path}\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof ConfigParseError) {
    return [
      "配置文件格式有误：",
      `  path: ${error.path}`,
      bullet(error.issues),
    ].join("\n")
  }
  if (error instanceof ConfigValidationError) {
    return ["配置无效：", bullet(error.issues)].join("\n")
  }
  if (error instanceof ApiKeyError) {
    return error.envVar === ""
      ? "未配置 API 密钥：请在 api.key 或 api.keyEnv 中提供。"
      : `环境变量 ${error.envVar} 中没有 API 密钥。`
  }
  if (error instanceof LlmRequestError) {
    return `向 AI 请求失败：\n  url: ${error.url}\n  ${error.message}\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof LlmResponseError) {
    return ["解析 AI 应答失败：", `  url: ${error.url}`, bullet(error.issues)].join(
      "\n",
    )
  }
  if (error instanceof SessionReadError) {
    return `读取会话失败：\n  path: ${error.path}\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof SessionWriteError) {
    return `写入会话失败：\n  path: ${error.path}\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof SessionNotFoundError) {
    return `找不到会话：${error.sessionId}`
  }
  if (error instanceof ServerUnavailableError) {
    return `无法连接 qwq 服务器：${error.url}\n  请先运行 \`qwq serve\`。\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof ServerStartError) {
    return `启动 qwq 服务器失败：\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof RemoteAskError) {
    return `与 qwq 服务器通信失败：${error.message}\n  请确认已运行 \`qwq serve\`。`
  }
  if (error instanceof VoiceConfigError) {
    return `语音配置有误：${error.message}`
  }
  if (error instanceof AudioError) {
    return `音频采集失败（${error.backend}）：${error.message}\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof KwsError) {
    return `唤醒词检测失败：${error.message}\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof AsrError) {
    return `语音识别失败：${error.message}\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof TtsError) {
    return `语音合成失败：${error.message}\n  cause: ${causeMessage(error.cause)}`
  }
  return error instanceof Error
    ? `出现未知错误：${error.message}`
    : `出现未知错误：${String(error)}`
}
