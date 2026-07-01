import { useEffect, useState } from "react";
import {
  ACTIVITY_LOG_STORAGE_KEY,
  appendActivityEntry,
  mergeActivityLogs,
  pruneActivityLog,
  type ActivityKind,
  type ActivityLogStore
} from "./activity-log.js";

type ChatGptWindow = Window & {
  openai?: {
    widgetState?: {
      technotrackerActivityLog?: unknown;
    };
    setWidgetState?: (state: unknown) => void | Promise<void>;
  };
};

export function useActivityLog(date: string) {
  const [store, setStore] = useState<ActivityLogStore>(() => readStore());

  useEffect(() => {
    writeStore(store);
  }, [store]);

  function log(kind: ActivityKind, message: string, id?: string) {
    setStore((current) =>
      appendActivityEntry(current, date, {
        kind,
        message,
        ...(id ? { id } : {})
      })
    );
  }

  return { entries: store[date] ?? [], log };
}

function readStore(): ActivityLogStore {
  const widgetStore = pruneActivityLog(
    getOpenAi()?.widgetState?.technotrackerActivityLog
  );
  let localStore: ActivityLogStore = {};
  try {
    localStore = pruneActivityLog(
      JSON.parse(localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY) ?? "{}")
    );
  } catch {
    // ChatGPT widget state remains available when local storage is blocked.
  }
  return mergeActivityLogs(localStore, widgetStore);
}

function writeStore(store: ActivityLogStore) {
  try {
    localStorage.setItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Widget-state persistence remains available when local storage is blocked.
  }
  const openai = getOpenAi();
  if (openai?.setWidgetState) {
    void openai.setWidgetState({
      ...(openai.widgetState ?? {}),
      technotrackerActivityLog: store
    });
  }
}

function getOpenAi() {
  return (window as ChatGptWindow).openai;
}
