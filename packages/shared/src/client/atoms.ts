import { Atom } from "@effect-atom/atom"
import { Option } from "effect"
import {
  initialChatState,
  initialSessionsState,
  type ChatState,
  type SessionsState,
} from "./state"

export const chatAtom = Atom.make<ChatState>(initialChatState)

export const sessionsAtom = Atom.make<SessionsState>(initialSessionsState)

export interface PermissionPrompt {
  readonly requestId: string
  readonly tool: string
  readonly detail: string
}

export const permissionAtom = Atom.make<Option.Option<PermissionPrompt>>(
  Option.none(),
)
