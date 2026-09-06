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

export type DesktopHumanTaskNotification = {
  id: string;
  title: string;
  body: string;
  route: string;
};

export type DesktopHumanTasksBridge = {
  update(input: {
    count: number;
    notificationSound: boolean;
    systemNotifications: boolean;
    tasks: DesktopHumanTaskNotification[];
  }): void;
  subscribeNavigation(callback: (route: string) => void): () => void;
};

declare global {
  interface Window {
    contentflowDesktop?: {
      updater: DesktopUpdaterBridge;
      humanTasks?: DesktopHumanTasksBridge;
    };
  }
}

export function desktopHumanTasksBridge() {
  if (typeof window === "undefined") return undefined;
  return window.contentflowDesktop?.humanTasks;
}

export function desktopUpdaterBridge() {
  if (typeof window === "undefined") return undefined;
  return window.contentflowDesktop?.updater;
}
