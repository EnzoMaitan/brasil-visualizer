// Shared React context + helpers for Brasil Visualizer.
import { createContext, useContext } from "react";
import type { Lang, StateRecord } from "../data/types";
import type { T } from "../i18n";
import type { TweakValues } from "../components/tweaks/useTweaks";

export interface VizContextValue {
  t: T;
  locale: Lang;
  lang: Lang;
  tweaks: TweakValues;
}

export const VizContext = createContext<VizContextValue | null>(null);

export function useViz(): VizContextValue {
  const ctx = useContext(VizContext);
  if (!ctx) throw new Error("useViz must be used within a VizContext.Provider");
  return ctx;
}

// numeric min/avg/max of a prop over records
export function statsOf(records: StateRecord[], prop: string) {
  const vals = records.map((r) => r[prop]).filter((v): v is number => typeof v === "number");
  const min = Math.min(...vals), max = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { min, max, avg };
}

// rank of a record's prop (1 = highest, or 1 = lowest if asc)
export function rankOf(records: StateRecord[], code: string, prop: string, asc: boolean): number {
  const sorted = [...records].sort((a, b) =>
    asc ? (a[prop] as number) - (b[prop] as number) : (b[prop] as number) - (a[prop] as number)
  );
  return sorted.findIndex((r) => r.code === code) + 1;
}
