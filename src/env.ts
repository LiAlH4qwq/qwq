export interface EnvVar {
    name: string
    value: string
}

// Dirty
type GetEnvVars = (names: readonly string[]) => EnvVar[]
type GetExePathOrSrcDir = () => string
type GetWorkingDir = () => string
type GetIsExeFile = () => boolean
type GetRawMainDir = () => string
type GetRawMainPath = () => string
type GetRawExecDir = () => string
type GetRawExecPath = () => string

// Pure
type DropPathLastOne = (path: string) => string
type DropPathLastTwo = (path: string) => string
type DropPathLastN = (path: string, n: number) => string

export const getEnvVars: GetEnvVars = (names) =>
    names
        .map(name => {
            const rawValue = Bun.env[name]
            const value = rawValue === undefined ? "<undefined>" : rawValue
            const envVar = { name, value }
            return envVar
        })

export const getExePathOrSrcDir: GetExePathOrSrcDir = () =>
    getIsExeFile() ? getRawExecPath() : getRawMainDir()

export const getWorkingDir: GetWorkingDir = () =>
    getIsExeFile() ? getRawExecDir() : getRawMainDir()

export const getIsExeFile: GetIsExeFile = () =>
    getRawMainPath().startsWith("/$bunfs/root/")

const getRawMainDir: GetRawMainDir = () =>
    dropPathLastTwo(getRawMainPath())

const getRawMainPath: GetRawMainPath = () => Bun.main

const getRawExecDir: GetRawExecDir = () =>
    dropPathLastOne(getRawExecPath())

const getRawExecPath: GetRawExecPath = () => process.execPath

const dropPathLastOne: DropPathLastOne = (path) => dropPathLastN(path, 1)

const dropPathLastTwo: DropPathLastTwo = (path) => dropPathLastN(path, 2)

const dropPathLastN: DropPathLastN = (path, n) =>
    path
        .split("/")
        .slice(0, - n)
        .join("/")