import { Schema } from "effect"

export const ApiType = Schema.Literal("anthropic", "openai")
export type ApiType = typeof ApiType.Type

export const ApiConfig = Schema.Struct({
  type: ApiType,
  url: Schema.NonEmptyString,
  model: Schema.NonEmptyString,
  key: Schema.optional(Schema.NonEmptyString),
  keyEnv: Schema.optional(Schema.NonEmptyString),
  stream: Schema.optionalWith(Schema.Boolean, { default: () => true }),
})
export type ApiConfig = typeof ApiConfig.Type

export const SessionTitleConfig = Schema.Struct({
  // Generate a model-written topic title (opt-out). When disabled the title
  // falls back to 「前端：时间」.
  enable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  maxChars: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 20,
  }),
})
export type SessionTitleConfig = typeof SessionTitleConfig.Type

export const SessionCompactConfig = Schema.Struct({
  // Auto-compaction: when the working transcript exceeds `maxChars`, older
  // messages are summarised by the model and replaced by a single note.
  enable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  maxChars: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 48000,
  }),
  keepRecent: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 16,
  }),
})
export type SessionCompactConfig = typeof SessionCompactConfig.Type

export const SessionsConfig = Schema.Struct({
  // Where session JSON files live. Empty means `${cwd}/sessions`.
  dir: Schema.optionalWith(Schema.String, { default: () => "" }),
  // Voice and command sessions started again within this window reuse the
  // previous session instead of creating a new one.
  reuseMinutes: Schema.optionalWith(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)),
    { default: () => 1 },
  ),
  title: Schema.optionalWith(SessionTitleConfig, {
    default: () => ({ enable: true, maxChars: 20 }),
  }),
  compact: Schema.optionalWith(SessionCompactConfig, {
    default: () => ({ enable: true, maxChars: 48000, keepRecent: 16 }),
  }),
})
export type SessionsConfig = typeof SessionsConfig.Type

export const EnvAccessConfig = Schema.Struct({
  envVars: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
})
export type EnvAccessConfig = typeof EnvAccessConfig.Type

export const ServerConfig = Schema.Struct({
  host: Schema.optionalWith(Schema.NonEmptyString, {
    default: () => "127.0.0.1",
  }),
  port: Schema.optionalWith(Schema.Int.pipe(Schema.between(1, 65535)), {
    default: () => 8787,
  }),
})
export type ServerConfig = typeof ServerConfig.Type

export const AudioBackend = Schema.Literal(
  "auto",
  "pipewire",
  "pulse",
  "alsa",
)
export type AudioBackend = typeof AudioBackend.Type

export const VoiceAudioConfig = Schema.Struct({
  backend: Schema.optionalWith(AudioBackend, { default: () => "auto" as const }),
  device: Schema.optionalWith(Schema.String, { default: () => "" }),
  sampleRate: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 16000,
  }),
  echoCancel: Schema.optionalWith(Schema.Boolean, { default: () => false }),
})
export type VoiceAudioConfig = typeof VoiceAudioConfig.Type

export const WakeWordConfig = Schema.Struct({
  command: Schema.optionalWith(Schema.NonEmptyString, {
    default: () => "qwq-kws",
  }),
  args: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
  modelDir: Schema.NonEmptyString,
  encoder: Schema.optional(Schema.NonEmptyString),
  decoder: Schema.optional(Schema.NonEmptyString),
  joiner: Schema.optional(Schema.NonEmptyString),
  keywordsFile: Schema.NonEmptyString,
  keywordsScore: Schema.optionalWith(Schema.Number, { default: () => 1.5 }),
  keywordsThreshold: Schema.optionalWith(Schema.Number, { default: () => 0.25 }),
  provider: Schema.optionalWith(Schema.String, { default: () => "cpu" }),
  numThreads: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 1,
  }),
})
export type WakeWordConfig = typeof WakeWordConfig.Type

export const AsrConfig = Schema.Struct({
  binary: Schema.optionalWith(Schema.NonEmptyString, {
    default: () => "sherpa-onnx-offline",
  }),
  modelDir: Schema.NonEmptyString,
  modelFile: Schema.optional(Schema.NonEmptyString),
  tokens: Schema.optionalWith(Schema.String, { default: () => "" }),
  language: Schema.optionalWith(Schema.String, { default: () => "zh" }),
  numThreads: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 2,
  }),
  // onnxruntime execution provider (cpu | cuda | openvino | rocm | …). Only
  // providers compiled into the current sherpa-onnx build are accepted.
  provider: Schema.optionalWith(Schema.String, { default: () => "cpu" }),
})
export type AsrConfig = typeof AsrConfig.Type

export const PowerProfile = Schema.Literal("battery", "balanced", "performance")
export type PowerProfile = typeof PowerProfile.Type

export const Accel = Schema.Literal("auto", "cpu", "openvino", "cuda", "rocm", "npu")
export type Accel = typeof Accel.Type

export const VoiceConfig = Schema.Struct({
  audio: Schema.optionalWith(VoiceAudioConfig, {
    default: () => ({
      backend: "auto" as const,
      device: "",
      sampleRate: 16000,
      echoCancel: false,
    }),
  }),
  wakeWord: WakeWordConfig,
  asr: AsrConfig,
  silenceMs: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 800,
  }),
  // How long to wait for the user to start speaking after the wake word (or
  // after the acknowledgement) before giving up.
  initialSilenceMs: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 6000,
  }),
  silenceThreshold: Schema.optionalWith(Schema.Number, { default: () => 500 }),
  maxUtteranceMs: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 10000,
  }),
  preRollMs: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 1500,
  }),
  acknowledge: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  acknowledgeText: Schema.optionalWith(Schema.String, { default: () => "" }),
  speakErrors: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  asrErrorText: Schema.optionalWith(Schema.String, { default: () => "" }),
  llmErrorText: Schema.optionalWith(Schema.String, { default: () => "" }),
  // Spoken feedback around tool calls and permission prompts. Empty strings use
  // the preset defaults (see `presetVoicePhrases`); `{name}` is replaced with
  // the tool name.
  speakTools: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  toolStartText: Schema.optionalWith(Schema.String, { default: () => "" }),
  toolResultText: Schema.optionalWith(Schema.String, { default: () => "" }),
  toolDeniedText: Schema.optionalWith(Schema.String, { default: () => "" }),
  permissionText: Schema.optionalWith(Schema.String, { default: () => "" }),
  permissionGrantedText: Schema.optionalWith(Schema.String, { default: () => "" }),
  permissionDeniedText: Schema.optionalWith(Schema.String, { default: () => "" }),
  permissionTimeoutText: Schema.optionalWith(Schema.String, { default: () => "" }),
  // Words that accept/reject a permission request when spoken. Checked by
  // substring on the recognised text (deny words win ties).
  permissionAllowWords: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [
      "允许",
      "同意",
      "可以",
      "好的",
      "好",
      "是",
      "对",
      "yes",
      "allow",
      "ok",
      "okay",
    ] as ReadonlyArray<string>,
  }),
  permissionDenyWords: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [
      "拒绝",
      "不要",
      "不行",
      "不可以",
      "否",
      "不",
      "取消",
      "no",
      "deny",
      "cancel",
    ] as ReadonlyArray<string>,
  }),
  // Power profile. `battery` favours the lowest idle draw (wake accuracy is
  // allowed to give way); `performance` favours latency/accuracy.
  power: Schema.optionalWith(PowerProfile, {
    default: () => "battery" as const,
  }),
  // Preferred accelerator for one-shot ASR/TTS. The always-on wake-word engine
  // stays on CPU on battery: a GPU bring-up costs more power than it saves for
  // a tiny streaming model.
  accel: Schema.optionalWith(Accel, { default: () => "auto" as const }),
})
export type VoiceConfig = typeof VoiceConfig.Type

export const PromptModuleOverrides = Schema.Struct({
  common: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
  voice: Schema.optional(Schema.String),
  chat: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
})
export type PromptModuleOverrides = typeof PromptModuleOverrides.Type

export const PromptsConfig = Schema.Struct({
  preset: Schema.optionalWith(Schema.String, { default: () => "default" }),
  modules: Schema.optionalWith(PromptModuleOverrides, { default: () => ({}) }),
})
export type PromptsConfig = typeof PromptsConfig.Type

export const TtsEngine = Schema.Literal("none", "piper", "command")
export type TtsEngine = typeof TtsEngine.Type

export const TtsConfig = Schema.Struct({
  enable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  engine: Schema.optionalWith(TtsEngine, { default: () => "none" as const }),
  binary: Schema.optionalWith(Schema.NonEmptyString, { default: () => "piper" }),
  model: Schema.optionalWith(Schema.String, { default: () => "" }),
  speed: Schema.optionalWith(Schema.Number, { default: () => 1.0 }),
  player: Schema.optionalWith(Schema.NonEmptyString, { default: () => "pw-play" }),
  command: Schema.optionalWith(Schema.String, { default: () => "" }),
  // onnxruntime execution provider for TTS binaries that accept `--provider`
  // (e.g. sherpa-onnx offline TTS). Empty means: do not pass one (piper).
  provider: Schema.optionalWith(Schema.String, { default: () => "" }),
})
export type TtsConfig = typeof TtsConfig.Type

export const GuiTheme = Schema.Literal("light", "dark")
export type GuiTheme = typeof GuiTheme.Type

export const GuiPopup = Schema.Literal("voice", "all", "none")
export type GuiPopup = typeof GuiPopup.Type

export const GuiConfig = Schema.Struct({
  enable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  tray: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  popupDurationMs: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThan(0)),
    { default: () => 10000 },
  ),
  theme: Schema.optionalWith(GuiTheme, { default: () => "light" as const }),
  // Which sessions pop up the reply window: voice-only (default), all, or none.
  popup: Schema.optionalWith(GuiPopup, { default: () => "voice" as const }),
})
export type GuiConfig = typeof GuiConfig.Type

export const ToolMode = Schema.Literal("auto", "off")
export type ToolMode = typeof ToolMode.Type

export const NativeToolMode = Schema.Literal("auto", "on", "off")
export type NativeToolMode = typeof NativeToolMode.Type

export const PermissionMode = Schema.Literal("ask", "auto", "deny")
export type PermissionMode = typeof PermissionMode.Type

export const ToolsPermissionConfig = Schema.Struct({
  // What to do with a "review" command (risky but not hard-denied):
  // ask the frontend, allow automatically, or deny outright.
  mode: Schema.optionalWith(PermissionMode, { default: () => "ask" as const }),
  // Regexes whose matching commands are allowed without a review prompt.
  allow: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
  // How long to wait for an interactive answer before denying (milliseconds).
  timeoutMs: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 60000,
  }),
})
export type ToolsPermissionConfig = typeof ToolsPermissionConfig.Type

export const ToolsConfig = Schema.Struct({
  enable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  mode: Schema.optionalWith(ToolMode, { default: () => "auto" as const }),
  native: Schema.optionalWith(NativeToolMode, { default: () => "auto" as const }),
  shell: Schema.optionalWith(Schema.String, { default: () => "" }),
  workingDir: Schema.optionalWith(Schema.String, { default: () => "" }),
  timeoutMs: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 30000,
  }),
  maxSteps: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 8,
  }),
  maxOutputBytes: Schema.optionalWith(Schema.Int.pipe(Schema.greaterThan(0)), {
    default: () => 20000,
  }),
  blacklist: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
  permission: Schema.optionalWith(ToolsPermissionConfig, {
    default: () => ({ mode: "ask" as const, allow: [], timeoutMs: 60000 }),
  }),
})
export type ToolsConfig = typeof ToolsConfig.Type

export const Config = Schema.Struct({
  debug: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  api: ApiConfig,
  sessions: Schema.optionalWith(SessionsConfig, {
    default: () => ({
      dir: "",
      reuseMinutes: 1,
      title: { enable: true, maxChars: 20 },
      compact: { enable: true, maxChars: 48000, keepRecent: 16 },
    }),
  }),
  envAccess: Schema.optionalWith(EnvAccessConfig, {
    default: () => ({ envVars: [] as ReadonlyArray<string> }),
  }),
  server: Schema.optionalWith(ServerConfig, {
    default: () => ({ host: "127.0.0.1", port: 8787 }),
  }),
  voice: Schema.optional(VoiceConfig),
  prompts: Schema.optionalWith(PromptsConfig, {
    default: () => ({ preset: "default", modules: {} }),
  }),
  tts: Schema.optionalWith(TtsConfig, {
    default: () => ({
      enable: true,
      engine: "none" as const,
      binary: "piper",
      model: "",
      speed: 1.0,
      player: "pw-play",
      command: "",
      provider: "",
    }),
  }),
  gui: Schema.optionalWith(GuiConfig, {
    default: () => ({
      enable: true,
      tray: true,
      popupDurationMs: 10000,
      theme: "light" as const,
      popup: "voice" as const,
    }),
  }),
  tools: Schema.optionalWith(ToolsConfig, {
    default: () => ({
      enable: true,
      mode: "auto" as const,
      native: "auto" as const,
      shell: "",
      workingDir: "",
      timeoutMs: 30000,
      maxSteps: 8,
      maxOutputBytes: 20000,
      blacklist: [] as ReadonlyArray<string>,
      permission: { mode: "ask" as const, allow: [], timeoutMs: 60000 },
    }),
  }),
})
export type Config = typeof Config.Type
