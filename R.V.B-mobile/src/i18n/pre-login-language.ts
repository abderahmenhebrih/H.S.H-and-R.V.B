import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { Language } from "./index";

const STORAGE_KEY = "rvb.preLoginLanguage";

const SUPPORTED: readonly Language[] = ["en", "fr", "ar"];

// In-memory value: "en" until async hydration completes. Synchronous reads
// (getCurrentLanguage) are safe from boot; subscribers re-render on hydrate.
let current: Language = "en";
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {}
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isValid(lang: unknown): lang is Language {
  return typeof lang === "string" && (SUPPORTED as readonly string[]).includes(lang);
}

async function readStored(): Promise<Language | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      const v = window.localStorage.getItem(STORAGE_KEY);
      return isValid(v) ? v : null;
    }
    const v = await SecureStore.getItemAsync(STORAGE_KEY);
    return isValid(v) ? v : null;
  } catch {
    return null;
  }
}

async function writeStored(lang: Language): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STORAGE_KEY, lang);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, lang);
  } catch {}
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  void readStored().then((stored) => {
    if (stored && stored !== current) {
      current = stored;
      emit();
    }
  });
}

/** Synchronous read of the pre-login selection ("en" until hydrated). */
export function getPreLoginLanguage(): Language {
  hydrate();
  return current;
}

/** Persist + broadcast the pre-login selection. Never touches auth state. */
export async function setPreLoginLanguage(lang: Language): Promise<void> {
  if (!isValid(lang)) return;
  current = lang;
  emit();
  await writeStored(lang);
}

/** Reactive binding for the pre-login selection (account-independent). */
export function usePreLoginLanguage(): { lang: Language; setLang: (lang: Language) => void } {
  const lang = useSyncExternalStore(subscribe, () => current, () => current);
  hydrate();
  return { lang, setLang: (l) => void setPreLoginLanguage(l) };
}
