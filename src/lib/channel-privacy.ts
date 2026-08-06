import { useEffect, useState } from "react";

const STORAGE_KEY = "contentflow:hidden-channel-cards";
const CHANGE_EVENT = "contentflow:channel-privacy-change";

function readHiddenChannelIds() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const storedIds = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(
      Array.isArray(storedIds)
        ? storedIds.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return new Set<string>();
  }
}

export function useHiddenChannelIds() {
  const [hiddenChannelIds, setHiddenChannelIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const refresh = () => setHiddenChannelIds(readHiddenChannelIds());
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) refresh();
    };

    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refreshFromStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refreshFromStorage);
    };
  }, []);

  return hiddenChannelIds;
}

export function toggleChannelPrivacy(channelId: string) {
  const hiddenChannelIds = readHiddenChannelIds();
  if (hiddenChannelIds.has(channelId)) {
    hiddenChannelIds.delete(channelId);
  } else {
    hiddenChannelIds.add(channelId);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenChannelIds]));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
