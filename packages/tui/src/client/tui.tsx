import type { Registry } from "@effect-atom/atom"
import { RegistryContext, useAtomValue } from "@effect-atom/atom-react"
import { Box, Text, render, useInput } from "ink"
import { useState } from "react"
import { Option } from "effect"
import { chatAtom, permissionAtom, sessionsAtom } from "@qwq/shared/client/atoms"
import { streamingText } from "@qwq/shared/client/state"
import { inkColorByTone } from "@qwq/shared/client/theme"
import {
  busyStatus,
  clampLines,
  permissionView,
  presentParts,
  windowOf,
  type ViewPart,
} from "@qwq/shared/client/view"

export interface TuiHandlers {
  readonly ask: (question: string) => void
  readonly selectSession: (sessionId: string) => void
  readonly respondPermission: (requestId: string, allow: boolean) => void
  readonly exit: () => void
}

const Part = ({ part }: { readonly part: ViewPart }) => {
  if (part._tag === "User") {
    return (
      <Text color={inkColorByTone.user} wrap="wrap">
        {`你：${part.content}`}
      </Text>
    )
  }
  if (part._tag === "Assistant") {
    return (
      <Text color={inkColorByTone.assistant} wrap="wrap">
        {part.content}
      </Text>
    )
  }
  const body =
    part.phase === "start"
      ? `运行中… ${clampLines(part.detail, 2)}`
      : clampLines(part.output, 6)
  return (
    <Box flexDirection="column" marginTop={0}>
      <Text color={inkColorByTone[part.tone]}>
        {`${part.glyph} ${part.name}`}
      </Text>
      <Text color={inkColorByTone.muted} wrap="wrap">
        {body}
      </Text>
    </Box>
  )
}

const Tui = ({ ask, selectSession, respondPermission, exit }: TuiHandlers) => {
  const chat = useAtomValue(chatAtom)
  const sessions = useAtomValue(sessionsAtom)
  const permission = useAtomValue(permissionAtom)
  const [input, setInput] = useState("")
  const [picker, setPicker] = useState(false)
  const [cursor, setCursor] = useState(0)

  const list = sessions.list
  const prompt = Option.getOrNull(permission)

  useInput((char, key) => {
    if (prompt !== null) {
      if (char === "y" || char === "Y") {
        respondPermission(prompt.requestId, true)
      } else if (char === "n" || char === "N" || key.escape) {
        respondPermission(prompt.requestId, false)
      }
      return
    }
    if (picker) {
      if (key.escape) {
        setPicker(false)
        return
      }
      if (key.upArrow) {
        setCursor((value) => (value <= 0 ? 0 : value - 1))
        return
      }
      if (key.downArrow) {
        setCursor((value) => (value + 1 >= list.length ? value : value + 1))
        return
      }
      if (key.return) {
        Option.match(Option.fromNullable(list[cursor]), {
          onNone: () => setPicker(false),
          onSome: (chosen) => {
            selectSession(chosen.id)
            setPicker(false)
          },
        })
        return
      }
      return
    }
    if (key.escape || (key.ctrl && char === "c")) {
      exit()
      return
    }
    if (key.ctrl && char === "s") {
      setPicker(true)
      setCursor(0)
      return
    }
    if (key.return) {
      const question = input.trim()
      if (question === "/exit" || question === "/quit") {
        exit()
        return
      }
      if (question === "/sessions") {
        setPicker(true)
        setCursor(0)
        setInput("")
        return
      }
      if (question !== "") {
        ask(question)
        setInput("")
      }
      return
    }
    if (key.backspace || key.delete) {
      setInput((value) => value.slice(0, -1))
      return
    }
    if (char !== "" && !key.ctrl && !key.meta) {
      setInput((value) => value + char)
    }
  })

  const title = Option.getOrElse(sessions.current, () => "新会话")
  const visible = windowOf(presentParts(chat.parts), 16)
  const streamed = streamingText(chat)
  const status = busyStatus(chat.busy)
  const permissionDetail =
    prompt === null ? null : permissionView(prompt)

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={inkColorByTone.accent} bold>
          {`qwq  ${title}`}
        </Text>
        <Text color={inkColorByTone[status.tone]}>{status.text}</Text>
      </Box>
      {visible.map((part, index) => (
        <Part key={index} part={part} />
      ))}
      {streamed === "" ? null : (
        <Text color={inkColorByTone.assistant} wrap="wrap">
          {streamed}
        </Text>
      )}
      {picker ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={inkColorByTone.accent} bold>
            会话（↑/↓ 选择，Enter 打开，Esc 取消）
          </Text>
          {list.slice(0, 10).map((session, index) => (
            <Text
              key={session.id}
              color={index === cursor ? inkColorByTone.user : inkColorByTone.muted}
              inverse={index === cursor}
            >
              {`${session.title}  (${session.messageCount})`}
            </Text>
          ))}
        </Box>
      ) : null}
      {permissionDetail === null ? (
        <Box marginTop={1}>
          <Text color={inkColorByTone.ok}>{"> "}</Text>
          <Text>{input}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={inkColorByTone.warn} bold>
            {permissionDetail.title}
          </Text>
          <Text color={inkColorByTone.assistant} wrap="wrap">
            {clampLines(permissionDetail.body, 6)}
          </Text>
          <Text color={inkColorByTone.warn}>{permissionDetail.hint}</Text>
        </Box>
      )}
      <Text color={inkColorByTone.muted}>
        Enter 发送 · Ctrl+S 会话 · Esc 退出 · /new /sessions /exit
      </Text>
    </Box>
  )
}

export interface TuiInstance {
  readonly unmount: () => void
}

export const startTui = (
  registry: Registry.Registry,
  handlers: TuiHandlers,
): TuiInstance => {
  const instance = render(
    <RegistryContext.Provider value={registry}>
      <Tui {...handlers} />
    </RegistryContext.Provider>,
    { exitOnCtrlC: false },
  )
  return { unmount: () => instance.unmount() }
}
