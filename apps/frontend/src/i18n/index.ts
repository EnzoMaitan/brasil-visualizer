import type { Lang } from "../data/types";
import { BR_I18N } from "./strings";

export type T = (key: string) => string;

// Build a translator for a language, falling back EN → raw key (never throws).
export function makeT(lang: Lang): T {
  const dict = BR_I18N[lang] || {};
  const en = BR_I18N.en;
  return (k: string) => (dict[k] != null ? dict[k] : en[k] != null ? en[k] : k);
}

export { BR_I18N };
