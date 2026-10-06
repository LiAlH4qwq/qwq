import { version } from "@qwq/shared/version"

export interface CliSchema {
  readonly version: number
  readonly name: string
  readonly versionString: string
  readonly contract: {
    readonly stdout: string
    readonly stderr: string
    readonly exit: {
      readonly success: number
      readonly error: number
      readonly usage: number
    }
  }
  readonly commands: ReadonlyArray<string>
  readonly replProtocols: ReadonlyArray<string>
}

// The machine-readable CLI contract, printed by `qwq-cli schema`. stdout is the
// payload, stderr is diagnostics, and the exit codes are stable.
export const schemaDocument = (): CliSchema => ({
  version: 1,
  name: "qwq-cli",
  versionString: version,
  contract: {
    stdout: "payload only",
    stderr: "diagnostics",
    exit: { success: 0, error: 1, usage: 2 },
  },
  commands: ["ask", "repl", "list", "get", "rename", "delete", "schema"],
  replProtocols: ["interactive", "enq", "json"],
})
