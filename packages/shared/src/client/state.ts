import { Chunk, Option } from "effect"
import type { Message } from "../domain/message"
import type { Session, SessionSummary } from "../domain/session"
import type { QwqEvent } from "../server/rpc"

// A chat is an ordered timeline of parts, so tool activity interleaves with the
// assistant text exactly as it happened (like opencode's transcript).
export type ChatPart =
  | { readonly _tag: "User"; readonly content: string }
  | { readonly _tag: "Assistant"; readonly content: string }
  | {
      readonly _tag: "Tool"
      readonly name: string
      readonly detail: string
      readonly phase: "start" | "result"
      readonly output: string
    }

export interface ChatState {
  readonly parts: ReadonlyArray<ChatPart>
  // Streaming deltas are appended to a persistent Chunk and joined once at
  // render time, so a long answer is not copied on every token.
  readonly streaming: Chunk.Chunk<string>
  readonly busy: boolean
}

export const initialChatState: ChatState = {
  parts: [],
  streaming: Chunk.empty(),
  busy: false,
}

export type ChatEvent = Extract<
  QwqEvent,
  | { readonly _tag: "Message" }
  | { readonly _tag: "Delta" }
  | { readonly _tag: "Tool" }
>

export const isChatEvent = (event: QwqEvent): event is ChatEvent =>
  event._tag === "Message" || event._tag === "Delta" || event._tag === "Tool"

const completeTool = (
  parts: ReadonlyArray<ChatPart>,
  name: string,
  output: string,
): ReadonlyArray<ChatPart> => {
  const index = parts.findLastIndex(
    (part) => part._tag === "Tool" && part.name === name && part.phase === "start",
  )
  return index < 0
    ? [
        ...parts,
        { _tag: "Tool", name, detail: "", phase: "result", output },
      ]
    : parts.map((part, position) =>
        position === index && part._tag === "Tool"
          ? { ...part, phase: "result", output }
          : part,
      )
}

export const applyEvent = (state: ChatState, event: ChatEvent): ChatState => {
  switch (event._tag) {
    case "Delta":
      return {
        ...state,
        streaming: Chunk.append(state.streaming, event.content),
        busy: true,
      }
    case "Message":
      if (event.role === "user") {
        return {
          ...state,
          parts: [...state.parts, { _tag: "User", content: event.content }],
          streaming: Chunk.empty(),
          busy: true,
        }
      }
      return {
        ...state,
        parts: [
          ...state.parts,
          { _tag: "Assistant", content: event.content },
        ],
        streaming: Chunk.empty(),
        busy: false,
      }
    case "Tool":
      return event.phase === "start"
        ? {
            ...state,
            parts: [
              ...state.parts,
              {
                _tag: "Tool",
                name: event.name,
                detail: event.detail,
                phase: "start",
                output: "",
              },
            ],
          }
        : {
            ...state,
            parts: completeTool(state.parts, event.name, event.detail),
          }
  }
}

export interface SessionsState {
  readonly list: ReadonlyArray<SessionSummary>
  readonly current: Option.Option<string>
  readonly chats: Readonly<Record<string, ChatState>>
}

export const initialSessionsState: SessionsState = {
  list: [],
  current: Option.none(),
  chats: {},
}

const chatOf = (state: SessionsState, sessionId: string): ChatState =>
  Option.getOrElse(
    Option.fromNullable(state.chats[sessionId]),
    () => initialChatState,
  )

export const applySessionEvent = (
  state: SessionsState,
  event: QwqEvent,
): SessionsState => {
  if (event._tag === "SessionUpserted") {
    const rest = state.list.filter((item) => item.id !== event.session.id)
    return {
      ...state,
      list: [event.session, ...rest].toSorted(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    }
  }
  if (event._tag === "SessionDeleted") {
    return {
      ...state,
      list: state.list.filter((item) => item.id !== event.sessionId),
    }
  }
  if (isChatEvent(event)) {
    return {
      ...state,
      chats: {
        ...state.chats,
        [event.sessionId]: applyEvent(chatOf(state, event.sessionId), event),
      },
    }
  }
  return state
}

export const chatFromMessages = (
  messages: ReadonlyArray<Message>,
): ChatState => ({
  ...initialChatState,
  parts: messages.flatMap((message): ReadonlyArray<ChatPart> => {
    switch (message.role) {
      case "system":
        return []
      case "user":
        return [{ _tag: "User", content: message.content }]
      case "assistant":
        return [{ _tag: "Assistant", content: message.content }]
      case "tool":
        return [
          {
            _tag: "Tool",
            name: Option.getOrElse(
              Option.fromNullable(message.name),
              () => "tool",
            ),
            detail: "",
            phase: "result",
            output: message.content,
          },
        ]
    }
  }),
})

export const loadSessionDetail = (
  state: SessionsState,
  session: Session,
): SessionsState => ({
  ...state,
  current: Option.some(session.id),
  chats: {
    ...state.chats,
    [session.id]: chatFromMessages(session.messages),
  },
})

export const setCurrent = (
  state: SessionsState,
  sessionId: Option.Option<string>,
): SessionsState => ({ ...state, current: sessionId })

export const streamingText = (state: ChatState): string =>
  Chunk.join(state.streaming, "")
