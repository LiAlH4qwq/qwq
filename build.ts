const targets = [
    "linux-x64",
    "linux-x64-legacy",
    "linux-arm64",
    "linux-x64-musl",
    "linux-x64-musl-legacy",
    "linux-arm64-musl",
    "darwin-x64",
    "darwin-x64-legacy",
    "darwin-arm64",
    "windows-x64",
    "windows-x64-legacy"
] as const

type Main = () => Promise<never>
type TargetNameToBunReadable = (target: string) => string
type TargetNameToExecutableName = (target: string) => string

const targetNameToBunReadable: TargetNameToBunReadable = (target) => {
    const part = target.endsWith("legacy") ?
        target.replaceAll("legacy", "baseline") :
        `${target}-modern`
    return `bun-${part}`
}

const targetNameToExecutableName: TargetNameToExecutableName = (target) => {
    const part = target.startsWith("darwin") ? `${target}.app` :
        target.startsWith("windows") ? `${target}.exe` :
            target
    return `qwq-${part}`
}

const main: Main = async () => {
    await Bun.$`mkdir target`
    await Promise.all(targets.map(async target =>
        await Bun.$`bun build --compile --minify --sourcemap \
        --target=${targetNameToBunReadable(target)} \
        --outfile=target/${targetNameToExecutableName(target)} src/index.ts`))
    process.exit()
}

if (import.meta.path === Bun.main) main()