declare module "electron" {
  export interface WebContents {
    send(channel: string, ...args: ReadonlyArray<unknown>): void
  }

  export interface BrowserWindow {
    loadFile(
      file: string,
      options?: {
        readonly hash?: string
        readonly query?: Readonly<Record<string, string>>
      },
    ): Promise<void>
    show(): void
    hide(): void
    isDestroyed(): boolean
    on(
      event: string,
      listener: (...args: ReadonlyArray<unknown>) => void,
    ): void
    readonly webContents: WebContents
  }

  export interface BrowserWindowOptions {
    readonly width?: number
    readonly height?: number
    readonly frame?: boolean
    readonly alwaysOnTop?: boolean
    readonly show?: boolean
    readonly resizable?: boolean
    readonly skipTaskbar?: boolean
    readonly webPreferences?: {
      readonly nodeIntegration?: boolean
      readonly contextIsolation?: boolean
    }
  }

  export const BrowserWindow: {
    new (options?: BrowserWindowOptions): BrowserWindow
  }

  export interface NativeImage {
    readonly _brand: "NativeImage"
  }

  export const nativeImage: {
    createFromDataURL(url: string): NativeImage
    createEmpty(): NativeImage
  }

  export interface MenuItemConstructorOptions {
    readonly label?: string
    readonly type?: string
    readonly click?: () => void
  }

  export const Menu: {
    buildFromTemplate(
      template: ReadonlyArray<MenuItemConstructorOptions>,
    ): unknown
  }

  export interface Tray {
    setToolTip(text: string): void
    setContextMenu(menu: unknown): void
    on(event: string, listener: (...args: ReadonlyArray<unknown>) => void): void
  }

  export const Tray: {
    new (image: NativeImage): Tray
  }

  export const app: {
    whenReady(): Promise<void>
    on(
      event: string,
      listener: (...args: ReadonlyArray<unknown>) => void,
    ): void
    quit(): void
    getAppPath(): string
  }

  export interface IpcRenderer {
    on(
      channel: string,
      listener: (event: unknown, ...args: ReadonlyArray<unknown>) => void,
    ): void
    send(channel: string, ...args: ReadonlyArray<unknown>): void
  }

  export const ipcRenderer: IpcRenderer

  export interface IpcMain {
    on(
      channel: string,
      listener: (event: unknown, ...args: ReadonlyArray<unknown>) => void,
    ): void
  }

  export const ipcMain: IpcMain
}
