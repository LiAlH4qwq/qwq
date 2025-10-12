export interface EnvVar {
    name: string
    value: string
}

export const getEnvVars = (names: readonly string[]) =>
    names.map(name => {
        const rawValue = Bun.env[name]
        const value = rawValue === undefined ? "<undefined>" : rawValue
        const envVar = { name, value }
        return envVar
    })

export const getExePathOrSrcDir = () =>
    getIsExeFile() ? getRawExecPath() : getRawMainDir()

export const getWorkingDir = () =>
    getIsExeFile() ? getRawExecDir() : getRawMainDir()

export const getIsExeFile = () => getRawMainPath().startsWith("/$bunfs/root/")

const getRawMainDir = () => dropPathLastN(2)(getRawMainPath())

const getRawMainPath = () => Bun.main

const getRawExecDir = () => dropPathLastN(1)(getRawExecPath())

const getRawExecPath = () => process.execPath

const dropPathLastN = (n: number) => (path: string) =>
    path.split("/").slice(0, -n).join("/")
