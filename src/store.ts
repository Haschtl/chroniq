import { useSyncExternalStore } from "react";
import { initialAppState } from "./game";
import { normalizeAppState } from "./lib/migrations";
import type { AppState } from "./types";

const STORAGE_KEY = "chroniq:app-state:v1";

const listeners = new Set<() => void>();
let state = readState();

export const getState = () => state;

export const setState = (updater: AppState | ((current: AppState) => AppState)) => {
  state = typeof updater === "function" ? updater(state) : updater;
  writeState(state);
  listeners.forEach((listener) => listener());
};

export const useAppState = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState,
    getState,
  );

export const resetState = () => setState(initialAppState());

function readState(): AppState {
  if (typeof window === "undefined") return initialAppState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialAppState();
    return normalizeAppState(JSON.parse(raw));
  } catch {
    return initialAppState();
  }
}

const writeState = (nextState: AppState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
};
