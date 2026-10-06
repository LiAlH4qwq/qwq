import { Registry } from "@effect-atom/atom"
import { RegistryContext, useAtomValue } from "@effect-atom/atom-react"
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Progress,
  ScrollArea,
  Text,
  TextField,
  Theme,
} from "@radix-ui/themes"
import {
  ChatBubbleIcon,
  PaperPlaneIcon,
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons"
import { Option } from "effect"
import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { permissionAtom, sessionsAtom } from "@qwq/shared/client/atoms"
import {
  applySessionEvent,
  initialChatState,
  loadSessionDetail,
  setCurrent,
  streamingText,
  type ChatState,
} from "@qwq/shared/client/state"
import { radixColorByTone } from "@qwq/shared/client/theme"
import {
  busyStatus,
  permissionView,
  presentParts,
  sessionSubtitle,
  type ViewPart,
} from "@qwq/shared/client/view"
import type { Session, SessionSummary } from "@qwq/shared/domain/session"
import type { QwqEvent } from "@qwq/shared/server/rpc"

// The renderer runs with `nodeIntegration: true`, so Electron injects `require`
// into the window. We reach `ipcRenderer` through it instead of importing the
// external `electron` package, which an IIFE bundle cannot resolve.
interface IpcRendererLike {
  readonly on: (
    channel: string,
    listener: (event: unknown, ...args: ReadonlyArray<unknown>) => void,
  ) => void
  readonly send: (channel: string, ...args: ReadonlyArray<unknown>) => void
}

interface ElectronApi {
  readonly ipcRenderer: IpcRendererLike
}

declare global {
  interface Window {
    readonly require: (module: string) => ElectronApi
  }
}

const ipcRenderer = window.require("electron").ipcRenderer

const params = new URLSearchParams(location.search)
const popupMs = Number(Option.getOrElse(Option.fromNullable(params.get("popupMs")), () => "10000"))
const theme = params.get("theme") === "dark" ? "dark" : "light"
const isPopup = location.hash === "#popup"

const registry = Registry.make()

ipcRenderer.on("qwq-event", (_event, payload) => {
  const event = payload as QwqEvent
  if (event._tag === "Permission") {
    registry.update(permissionAtom, () =>
      Option.some({
        requestId: event.requestId,
        tool: event.tool,
        detail: event.detail,
      }),
    )
    return
  }
  registry.update(sessionsAtom, (state) => applySessionEvent(state, event))
})
ipcRenderer.on("qwq-sessions", (_event, payload) => {
  registry.update(sessionsAtom, (state) => ({
    ...state,
    list: payload as ReadonlyArray<SessionSummary>,
  }))
})
ipcRenderer.on("qwq-session", (_event, payload) => {
  registry.update(sessionsAtom, (state) =>
    loadSessionDetail(state, payload as Session),
  )
})

const PartView = ({ part }: { readonly part: ViewPart }) => {
  if (part._tag === "User") {
    return (
      <Text as="p" weight="medium" color={radixColorByTone.user}>
        {`你：${part.content}`}
      </Text>
    )
  }
  if (part._tag === "Assistant") {
    return (
      <Text as="p" style={{ whiteSpace: "pre-wrap" }}>
        {part.content}
      </Text>
    )
  }
  const body =
    part.phase === "start" ? `运行中… ${part.detail}` : part.output
  return (
    <Box>
      <Text size="1" color={radixColorByTone[part.tone]}>
        {`${part.glyph} ${part.name}`}
      </Text>
      <Text
        as="p"
        size="1"
        color="gray"
        style={{ whiteSpace: "pre-wrap", fontFamily: "var(--code-font-family)" }}
      >
        {body}
      </Text>
    </Box>
  )
}

const Transcript = ({ chat }: { readonly chat: ChatState }) => {
  const bottom = useRef<HTMLDivElement | null>(null)
  const parts = presentParts(chat.parts)
  const streamed = streamingText(chat)
  const marker = parts.length + streamed.length
  useEffect(() => {
    if (bottom.current !== null) {
      bottom.current.scrollIntoView()
    }
  }, [marker])
  return (
    <ScrollArea style={{ flex: 1 }}>
      <Flex direction="column" gap="2" p="3">
        {parts.map((part, index) => (
          <PartView key={index} part={part} />
        ))}
        {streamed === "" ? null : (
          <Text as="p" style={{ whiteSpace: "pre-wrap" }}>
            {streamed}
          </Text>
        )}
        <div ref={bottom} />
      </Flex>
    </ScrollArea>
  )
}

const PermissionDialog = () => {
  const permission = useAtomValue(permissionAtom)
  const prompt = Option.getOrNull(permission)
  if (prompt === null) {
    return null
  }
  const view = permissionView(prompt)
  const respond = (allow: boolean) => {
    registry.update(permissionAtom, () => Option.none())
    ipcRenderer.send("qwq-respond-permission", prompt.requestId, allow)
  }
  return (
    <AlertDialog.Root open>
      <AlertDialog.Content maxWidth="520px">
        <AlertDialog.Title>{view.title}</AlertDialog.Title>
        <Text as="p" size="2" style={{ whiteSpace: "pre-wrap" }}>
          {view.body}
        </Text>
        <Flex gap="3" justify="end" mt="4">
          <Button variant="soft" color="gray" onClick={() => respond(false)}>
            拒绝
          </Button>
          <Button color="green" onClick={() => respond(true)}>
            允许
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}

interface PickerProps {
  readonly list: ReadonlyArray<SessionSummary>
  readonly current: Option.Option<string>
  readonly now: number
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSelect: (id: string) => void
  readonly onNew: () => void
  readonly onRename: (id: string) => void
  readonly onDelete: (id: string) => void
}

const SessionPicker = (props: PickerProps) => (
  <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
    <Dialog.Content maxWidth="560px">
      <Flex justify="between" align="center" mb="2">
        <Dialog.Title style={{ margin: 0 }}>会话</Dialog.Title>
        <Button size="1" variant="soft" onClick={props.onNew}>
          <PlusIcon /> 新建
        </Button>
      </Flex>
      <Flex direction="column" gap="2">
        {props.list.map((session) => {
          const sub = sessionSubtitle(session, props.now)
          const active = Option.exists(props.current, (id) => id === session.id)
          return (
            <Card key={session.id} variant={active ? "classic" : "surface"}>
              <Flex justify="between" align="center" gap="2">
                <Box>
                  <Text weight="medium">{session.title}</Text>
                  <Text as="p" size="1" color="gray">
                    {`${sub.voice ? "语音 · " : ""}${sub.origin} · ${sub.count}`}
                  </Text>
                </Box>
                <Flex gap="1" align="center">
                  <Button
                    size="1"
                    variant="soft"
                    onClick={() => props.onSelect(session.id)}
                  >
                    打开
                  </Button>
                  <IconButton
                    size="1"
                    variant="soft"
                    aria-label="改名"
                    onClick={() => props.onRename(session.id)}
                  >
                    <Pencil1Icon />
                  </IconButton>
                  <IconButton
                    size="1"
                    variant="soft"
                    color="red"
                    aria-label="删除"
                    onClick={() => props.onDelete(session.id)}
                  >
                    <TrashIcon />
                  </IconButton>
                </Flex>
              </Flex>
            </Card>
          )
        })}
      </Flex>
    </Dialog.Content>
  </Dialog.Root>
)

const Chat = () => {
  const state = useAtomValue(sessionsAtom)
  const [value, setValue] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    ipcRenderer.send("qwq-list-sessions")
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  const current = state.current
  const chat = Option.getOrElse(
    Option.flatMap(current, (id) => Option.fromNullable(state.chats[id])),
    () => initialChatState,
  )
  const title = Option.getOrElse(current, () => "新会话")
  const status = busyStatus(chat.busy)

  const submit = () => {
    const question = value.trim()
    if (question === "") {
      return
    }
    ipcRenderer.send(
      "qwq-ask",
      Option.getOrElse(current, () => null),
      question,
    )
    setValue("")
  }

  return (
    <Flex direction="column" style={{ height: "100vh" }}>
      <Flex align="center" justify="between" px="3" py="2">
        <Flex align="center" gap="2">
          <Heading size="4" color={radixColorByTone.accent}>
            qwq
          </Heading>
          <Text size="2" color="gray">
            {title}
          </Text>
        </Flex>
        <Flex align="center" gap="2">
          <Badge color={status.tone === "warn" ? "amber" : "gray"}>
            {status.text}
          </Badge>
          <IconButton
            variant="soft"
            aria-label="会话"
            onClick={() => setPickerOpen(true)}
          >
            <ChatBubbleIcon />
          </IconButton>
        </Flex>
      </Flex>
      <Transcript chat={chat} />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Flex gap="2" p="3">
          <TextField.Root
            style={{ flex: 1 }}
            value={value}
            placeholder="输入问题…"
            onChange={(event) => setValue(event.target.value)}
          />
          <IconButton type="submit" aria-label="发送">
            <PaperPlaneIcon />
          </IconButton>
        </Flex>
      </form>
      <SessionPicker
        list={state.list}
        current={current}
        now={now}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(id) => {
          ipcRenderer.send("qwq-get-session", id)
          setPickerOpen(false)
        }}
        onNew={() => {
          registry.update(sessionsAtom, (s) => setCurrent(s, Option.none()))
          setPickerOpen(false)
        }}
        onRename={(id) => {
          const name = window.prompt("新的会话标题")
          if (name !== null && name.trim() !== "") {
            ipcRenderer.send("qwq-rename-session", id, name.trim())
          }
        }}
        onDelete={(id) => {
          if (window.confirm("删除这个会话？")) {
            ipcRenderer.send("qwq-delete-session", id)
          }
        }}
      />
      <PermissionDialog />
    </Flex>
  )
}

const Popup = () => {
  const [content, setContent] = useState("")
  const [remaining, setRemaining] = useState(popupMs)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    ipcRenderer.on("qwq-popup", (_event, payload) => {
      setContent(String(payload))
      setRemaining(popupMs)
      setPaused(false)
    })
    ipcRenderer.on("qwq-toggle-pause", () => setPaused((value) => !value))
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        ipcRenderer.send("qwq-hide-popup")
      } else if (event.key === " ") {
        event.preventDefault()
        setPaused((value) => !value)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (paused || remaining <= 0) {
      return
    }
    const timer = setTimeout(() => setRemaining((value) => value - 100), 100)
    return () => clearTimeout(timer)
  }, [remaining, paused])

  useEffect(() => {
    if (remaining <= 0) {
      ipcRenderer.send("qwq-hide-popup")
    }
  }, [remaining])

  const ratio = popupMs <= 0 ? 0 : Math.max(0, remaining) / popupMs
  return (
    <Card
      style={{ height: "100vh", borderRadius: 0, padding: 16 }}
      onClick={() => {
        ipcRenderer.send("qwq-open-chat")
        ipcRenderer.send("qwq-hide-popup")
      }}
    >
      <Text as="p" style={{ whiteSpace: "pre-wrap" }}>
        {content}
      </Text>
      <Box mt="3">
        <Progress value={ratio * 100} />
      </Box>
      <Flex gap="2" justify="end" mt="3">
        <Button
          size="1"
          variant="soft"
          onClick={(event) => {
            event.stopPropagation()
            setPaused((value) => !value)
          }}
        >
          {paused ? "继续自动关闭" : "暂停自动关闭"}
        </Button>
        <Button
          size="1"
          variant="soft"
          onClick={(event) => {
            event.stopPropagation()
            ipcRenderer.send("qwq-hide-popup")
          }}
        >
          关闭
        </Button>
      </Flex>
    </Card>
  )
}

const App = () => (isPopup ? <Popup /> : <Chat />)

const root = document.getElementById("root")
if (root !== null) {
  createRoot(root).render(
    <RegistryContext.Provider value={registry}>
      <Theme appearance={theme} accentColor="violet" radius="medium">
        <App />
      </Theme>
    </RegistryContext.Provider>,
  )
}
