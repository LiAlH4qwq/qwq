export interface EnvVar {
    name: string
    value: string
}

export interface RuntimeEnv {
    readonly env: (name: string) => string | undefined
    readonly main: string
    readonly execPath: string
}

export const runtimeEnv: RuntimeEnv = {
    env: name => Bun.env[name],
    main: Bun.main,
    execPath: process.execPath,
}

export const getEnvVars = (runtime: RuntimeEnv) => (names: readonly string[]) =>
    names.map(name => {
        const rawValue = runtime.env(name)
        const value = rawValue === undefined ? "<undefined>" : rawValue
        const envVar = { name, value }
        return envVar
    })

export const getExePathOrSrcDir = (runtime: RuntimeEnv) =>
    getIsExeFile(runtime) ? runtime.execPath : getRawMainDir(runtime.main)

export const getWorkingDir = (runtime: RuntimeEnv) =>
    getIsExeFile(runtime)
        ? dropPathLastN(1)(runtime.execPath)
        : getRawMainDir(runtime.main)

export const getIsExeFile = (runtime: RuntimeEnv) =>
    runtime.main.startsWith("/$bunfs/root/")

const getRawMainDir = (main: string) => dropPathLastN(2)(main)

const dropPathLastN = (n: number) => (path: string) =>
    path.split("/").slice(0, -n).join("/")
