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

const targetNameToBunReadable: TargetNameToBunReadable = (target) =>
    target.endsWith("legacy") ?
        target.replaceAll("legacy", "baseline") :
        `${target}-modern`

const main: Main = async () => {
    await Promise.all(targets.map(async target =>
        await Bun.$`bun build --compile --minify --sourcemap \
        --target=bun-${targetNameToBunReadable(target)} \
        --outfile=target/qwq-${target} src/index.ts`))
    process.exit()
}

if (import.meta.path === Bun.main) main()