import { lstatSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

interface Violation {
  readonly file: string
  readonly rule: string
}

const skippedDirectories = new Set([
  "node_modules",
  ".git",
  "dist",
  "result",
  ".direnv",
  ".pnpm-store",
  "docs",
])

const shellExtensions = [".sh", ".bash", ".bats"]

const bashShebang =
  /^#!\s*(?:\/usr\/bin\/env\s+)?(?:\/(?:usr\/)?bin\/)?(?:bash|sh|dash|zsh|ksh)\b/

const collectFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry)
    const stats = lstatSync(full)
    if (stats.isSymbolicLink()) {
      return []
    }
    if (stats.isDirectory()) {
      return skippedDirectories.has(entry) ? [] : collectFiles(full)
    }
    return stats.isFile() ? [full] : []
  })

const firstLine = (content: string): string => {
  const newline = content.indexOf("\n")
  return newline === -1 ? content : content.slice(0, newline)
}

const rulesFor = (file: string): ReadonlyArray<string> => {
  const extensionRules = shellExtensions
    .filter((extension) => file.endsWith(extension))
    .map(
      (extension) =>
        `shell script (${extension}) — bash is banned; author logic in TypeScript`,
    )
  if (extensionRules.length > 0) {
    return extensionRules
  }
  return bashShebang.test(firstLine(readFileSync(file, "utf8")))
    ? ["bash/sh shebang — author logic in TypeScript"]
    : []
}

const violations: ReadonlyArray<Violation> = collectFiles(".").flatMap((file) =>
  rulesFor(file).map((rule) => ({ file, rule })),
)

if (violations.length > 0) {
  const report = violations
    .map((item) => `${item.file}  ${item.rule}`)
    .join("\n")
  process.stderr.write(
    `check-shell: found ${violations.length} banned shell script(s):\n${report}\n`,
  )
  process.exit(1)
}

process.stdout.write("check-shell: no banned shell scripts\n")
