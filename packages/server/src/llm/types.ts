export interface ToolCall {
  readonly id: string
  readonly name: string
  readonly arguments: string
}

export interface ToolSpec {
  readonly name: string
  readonly description: string
  readonly parameters: unknown
}

export type LlmMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | {
      readonly role: "assistant"
      readonly content: string
      readonly toolCalls: ReadonlyArray<ToolCall>
    }
  | {
      readonly role: "tool"
      readonly toolCallId: string
      readonly name: string
      readonly content: string
    }

export interface CompletionResult {
  readonly text: string
  readonly toolCalls: ReadonlyArray<ToolCall>
}
