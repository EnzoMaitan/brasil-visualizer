// Single source of truth for tweak values, persisted to localStorage.
// (The design prototype spoke a host "edit mode" protocol; in the standalone app
// we just persist locally and let the gear button toggle the panel open.)
import { useCallback, useEffect, useState } from "react";

export interface TweakValues {
  borderWidth: number;
  glow: number;
  palette: string;
  labels: "none" | "minimal" | "all";
  dark: boolean;
}

export type SetTweak = <K extends keyof TweakValues>(key: K, val: TweakValues[K]) => void;

const STORAGE_KEY = "bv.tweaks";

export function useTweaks(defaults: TweakValues): [TweakValues, SetTweak] {
  const [values, setValues] = useState<TweakValues>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* ignore */ }
  }, [values]);

  const setTweak = useCallback<SetTweak>((key, val) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  return [values, setTweak];
}
