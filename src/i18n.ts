import de from "./locales/de.json";
import en from "./locales/en.json";
import type { AppLanguage } from "./types";

export type TranslationKey = keyof typeof de;
type TranslationValues = Record<string, string | number>;

const localeTables: Record<AppLanguage, Record<TranslationKey, string>> = {
  de,
  en,
};

const interpolate = (template: string, values?: TranslationValues) => {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
};

export const translateKey = (
  language: AppLanguage,
  key: TranslationKey,
  values?: TranslationValues,
) => interpolate(localeTables[language]?.[key] ?? localeTables.de[key] ?? key, values);

export const createTranslator =
  (language: AppLanguage) =>
  (key: TranslationKey, values?: TranslationValues) =>
    translateKey(language, key, values);
