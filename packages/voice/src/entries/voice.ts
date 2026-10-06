import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import type { CommandExecutor, FileSystem } from "@effect/platform"
import { Console, Effect, Layer, Option } from "effect"
import { presetVoicePhrases } from "@qwq/server/agent/prompt"
import { findConfigPath, write } from "@qwq/shared/client/cli-util"
import { loadConfig } from "@qwq/shared/config/load"
import { getEnvVars } from "@qwq/shared/domain/env"
import { formatDiagnostic } from "@qwq/shared/diagnostics"
import { VoiceConfigError } from "@qwq/shared/errors"
import type {
  AsrError,
  AudioError,
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
  KwsError,
  RemoteAskError,
} from "@qwq/shared/errors"
import { defaultConfigPath } from "@qwq/shared/paths"
import { QwqRpcClient } from "@qwq/shared/server/client"
import { version } from "@qwq/shared/version"
import { resolveVoiceAccel } from "@qwq/server/voice/accel"
import { layer as audioSourceLayer } from "@qwq/server/voice/audio"
import { layer as asrLayer } from "@qwq/server/voice/asr"
import { layer as kwsLayer } from "@qwq/server/voice/kws"
import {
  detectPower,
  resolvePower,
  withPower,
  withTtsAccel,
} from "@qwq/server/voice/profile"
import { runVoice } from "@qwq/server/voice/session"
import { layer as ttsLayer } from "@qwq/server/voice/tts"

const usage = `qwq-voice - 中文语音前端

用法：
  qwq-voice [--config <path>]   运行语音助手（唤醒词 → 识别 → 请求 → TTS）
  qwq-voice --help              显示本帮助
  qwq-voice --version           显示版本号

选项：
  -c, --config <path>   配置文件路径（默认 ./config.yaml）
  -h, --help            显示帮助并退出
  -v, --version         显示版本并退出
`

const runVoiceCommand = (
  configPath: string,
): Effect.Effect<
  void,
  | ConfigReadError
  | ConfigParseError
  | ConfigValidationError
  | VoiceConfigError
  | AudioError
  | KwsError
  | AsrError
  | RemoteAskError,
  FileSystem.FileSystem | CommandExecutor.CommandExecutor
> =>
  Effect.gen(function* () {
    const config = yield* loadConfig(configPath)
    const voiceOption = Option.fromNullable(config.voice)
    if (Option.isNone(voiceOption)) {
      return yield* Effect.fail(
        new VoiceConfigError({
          message: "配置文件缺少 voice 段，无法运行语音助手",
        }),
      )
    }
    const voice = voiceOption.value
    const accel = yield* resolveVoiceAccel(voice)
    const source = yield* detectPower
    const voiceConfig = withPower(
      { ...voice, power: resolvePower(voice.power, source) },
      accel,
    )
    const ttsConfig = withTtsAccel(config.tts, voiceConfig.power, accel)
    const envVars = getEnvVars(config.envAccess.envVars)
    const phrases = presetVoicePhrases(config.prompts.preset)
    const textOr = (value: string, fallback: string): string =>
      value.trim() === "" ? fallback : value
    const acknowledge = voiceConfig.acknowledge
      ? Option.some(textOr(voiceConfig.acknowledgeText, phrases.acknowledge))
      : Option.none<string>()
    const asrError = voiceConfig.speakErrors
      ? Option.some(textOr(voiceConfig.asrErrorText, phrases.asrError))
      : Option.none<string>()
    const llmError = voiceConfig.speakErrors
      ? Option.some(textOr(voiceConfig.llmErrorText, phrases.llmError))
      : Option.none<string>()
    const speakTools = voiceConfig.speakTools
    const toolStartText = textOr(voiceConfig.toolStartText, phrases.toolStart)
    const toolResultText = textOr(voiceConfig.toolResultText, phrases.toolResult)
    const toolDeniedText = textOr(voiceConfig.toolDeniedText, phrases.toolDenied)
    const permissionText = textOr(voiceConfig.permissionText, phrases.permission)
    const permissionGrantedText = textOr(
      voiceConfig.permissionGrantedText,
      phrases.permissionGranted,
    )
    const permissionDeniedText = textOr(
      voiceConfig.permissionDeniedText,
      phrases.permissionDenied,
    )
    const permissionTimeoutText = textOr(
      voiceConfig.permissionTimeoutText,
      phrases.permissionTimeout,
    )
    yield* Effect.gen(function* () {
      const client = yield* QwqRpcClient
      const respond = (question: string) =>
        client.ask({
          origin: "voice",
          shell: "Voice",
          question,
          envVars,
        })
      yield* runVoice({
        config: voiceConfig,
        respond,
        acknowledge,
        asrError,
        llmError,
        speakTools,
        toolStartText,
        toolResultText,
        toolDeniedText,
        permissionText,
        permissionGrantedText,
        permissionDeniedText,
        permissionTimeoutText,
        permissionAllowWords: voiceConfig.permissionAllowWords,
        permissionDenyWords: voiceConfig.permissionDenyWords,
        permissionTimeoutMs: config.tools.permission.timeoutMs,
        events: client.subscribe,
        respondPermission: (requestId, allow) =>
          client.respondPermission(requestId, allow).pipe(Effect.asVoid),
      }).pipe(
        Effect.provide(audioSourceLayer(voiceConfig.audio)),
        Effect.provide(
          kwsLayer(voiceConfig.wakeWord, voiceConfig.audio.sampleRate),
        ),
        Effect.provide(asrLayer(voiceConfig.asr, voiceConfig.audio.sampleRate)),
        Effect.provide(ttsLayer(ttsConfig)),
      )
    }).pipe(
      Effect.provide(
        QwqRpcClient.layerSocket({
          host: config.server.host,
          port: config.server.port,
        }),
      ),
    )
  })

const program = Effect.gen(function* () {
  const argv = yield* Effect.sync(() => process.argv.slice(2))
  if (argv.includes("--help") || argv.includes("-h")) {
    yield* Console.log(usage)
    return
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    yield* Console.log(`qwq-voice ${version}`)
    return
  }
  const configPath = Option.getOrElse(findConfigPath(argv), () =>
    defaultConfigPath(),
  )
  yield* runVoiceCommand(configPath)
})

const main = program.pipe(
  Effect.tapError((error) => write(`${formatDiagnostic(error)}\n`, "stderr")),
)

NodeRuntime.runMain(
  Effect.provide(main, Layer.mergeAll(NodeContext.layer, NodeHttpClient.layer)),
  { disableErrorReporting: true },
)
