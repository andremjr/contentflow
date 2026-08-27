export type DesktopUpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "up-to-date"
  | "error"
  | "unsupported";

export type DesktopUpdaterState = {
  status: DesktopUpdaterStatus;
  distribution: "installer" | "portable" | "development";
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  message: string;
};

export type DesktopUpdaterBridge = {
  getState(): Promise<DesktopUpdaterState>;
  check(): Promise<DesktopUpdaterState>;
  download(): Promise<DesktopUpdaterState>;
  install(): Promise<DesktopUpdaterState>;
  openReleases(): Promise<DesktopUpdaterState>;
  subscribe(callback: (state: DesktopUpdaterState) => void): () => void;
};

declare global {
  interface Window {
    contentflowDesktop?: {
      updater: DesktopUpdaterBridge;
    };
  }
}

export function desktopUpdaterBridge() {
  if (typeof window === "undefined") return undefined;
  return window.contentflowDesktop?.updater;
}
