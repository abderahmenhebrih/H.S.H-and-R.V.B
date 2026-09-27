"use client";

import { useState, StrictMode, useLayoutEffect, useRef } from "react";
import { useDbSync } from "@/src/hooks/useDbSync";

type Rec = {
  adds: number;
  removes: number;
  handlers: Set<EventListener>;
  calls: Array<{ id: string; value: string }>;
  seq: number;
  ids: Map<EventListener, number>;
};

function ensureRecSafe() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __pbs015bpatched?: boolean };
  if (w.__pbs015bpatched) return;
  w.__pbs015bpatched = true;
  ensureRec();
}

function ensureRec() {
  const w = window as unknown as { __pbs015brec?: Rec };
  if (!w.__pbs015brec) {
    const rec: Rec = { adds: 0, removes: 0, handlers: new Set(), calls: [], seq: 0, ids: new Map() };
    const origAdd = window.addEventListener.bind(window);
    const origRemove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject | null, ...rest: unknown[]) => {
      if (type === "hebrih-db-synced" && typeof fn === "function") {
        rec.adds += 1;
        rec.handlers.add(fn as EventListener);
        if (!rec.ids.has(fn as EventListener)) {
          rec.seq += 1;
          rec.ids.set(fn as EventListener, rec.seq);
        }
      }
      return (origAdd as (...a: unknown[]) => void)(type, fn, ...rest);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject | null, ...rest: unknown[]) => {
      if (type === "hebrih-db-synced" && typeof fn === "function") {
        rec.removes += 1;
        rec.handlers.delete(fn as EventListener);
      }
      return (origRemove as (...a: unknown[]) => void)(type, fn, ...rest);
    }) as typeof window.removeEventListener;
    w.__pbs015brec = rec;
    (window as unknown as { __pbs015b: object }).__pbs015b = {
      get adds() { return rec.adds; },
      get removes() { return rec.removes; },
      active: () => rec.handlers.size,
      calls: rec.calls,
      handlerIds: () => [...rec.handlers].map((fn) => rec.ids.get(fn) ?? -1).sort((a, b) => a - b),
    };
  }
}

ensureRecSafe();

export function fireSync() {
  window.dispatchEvent(new CustomEvent("hebrih-db-synced", { detail: { changes: [] } }));
}

function Probe({ id, value, mode, layoutFire }: { id: string; value: string; mode: "sync" | "resolve" | "reject" | "throw"; layoutFire: boolean }) {
  useDbSync(() => {
    const w = window as unknown as { __pbs015brec?: Rec };
    w.__pbs015brec?.calls.push({ id, value });
    if (mode === "resolve") return Promise.resolve();
    if (mode === "reject") return Promise.reject(new Error("pbs015-boom"));
    if (mode === "throw") throw new Error("pbs015-sync-boom");
    return undefined;
  }, [value]);
  // Commit-phase dispatch: layout effects run after DOM commit but BEFORE any
  // passive effect — the exact stale window for passive-ref mirrors. Mount run
  // is skipped so each dispatch belongs to a real parameter commit.
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (layoutFire) fireSync();
  }, [value, layoutFire]);
  return null;
}

export default function TmpPbs015bPage() {
  const [value, setValue] = useState("A");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const [showB, setShowB] = useState(true);
  const [showStrict, setShowStrict] = useState(false);
  const [modeB, setModeB] = useState<"sync" | "resolve" | "reject" | "throw">("sync");

  return (
    <main>
      <Probe id="P" value={value} mode="sync" layoutFire />
      <Probe id="F" value={`${filter}:${search}`} mode="sync" layoutFire />
      {showB ? <Probe id="B" value={value} mode={modeB} layoutFire={false} /> : null}
      {showStrict ? (
        <StrictMode>
          <Probe id="S" value={value} mode="sync" layoutFire={false} />
        </StrictMode>
      ) : null}
      <button data-testid="noop" onClick={() => setTick((t) => t + 1)}>noop-{tick}</button>
      <button data-testid="set-b" onClick={() => setValue("B")}>set-b</button>
      <button data-testid="set-a" onClick={() => setSearch("a")}>a</button>
      <button data-testid="set-ab" onClick={() => setSearch("ab")}>ab</button>
      <button data-testid="set-abc" onClick={() => setSearch("abc")}>abc</button>
      <button data-testid="set-xyz" onClick={() => setSearch("xyz")}>xyz</button>
      <button data-testid="set-unread" onClick={() => setFilter("unread")}>unread</button>
      <button data-testid="toggle-b" onClick={() => setShowB((v) => !v)}>toggle-b</button>
      <button data-testid="mode-resolve" onClick={() => setModeB("resolve")}>resolve</button>
      <button data-testid="mode-reject" onClick={() => setModeB("reject")}>reject</button>
      <button data-testid="mode-throw" onClick={() => setModeB("throw")}>throw</button>
      <button data-testid="show-strict" onClick={() => setShowStrict(true)}>strict</button>
      <button data-testid="hide-strict" onClick={() => setShowStrict(false)}>unstrict</button>
    </main>
  );
}
