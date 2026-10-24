import { resolveLanguage } from './i18n.ts';
import type { LanguageCode } from './i18n.ts';
import type { ThemeName } from './theme.ts';

export type AppearanceMode = 'system' | 'light' | 'dark';

export interface SettingsStorage {
  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;
}

const KEY_HAPTICS = 'isHapticsEnabled';
const KEY_NO_GUESSING = 'isNoGuessingEnabled';
const KEY_THEME = 'selectedThemeName';
const KEY_LANGUAGE = 'selectedLanguage';
const KEY_APPEARANCE = 'appearanceMode';

export class Settings {
  private hapticsValue: boolean;
  private noGuessingValue: boolean;
  private themeValue: ThemeName;
  private languageValue: LanguageCode;
  private appearanceValue: AppearanceMode;
  private readonly storage: SettingsStorage;

  constructor(storage: SettingsStorage, systemLocale: string) {
    this.storage = storage;
    this.hapticsValue = readBool(storage.storageGet(KEY_HAPTICS), true);
    this.noGuessingValue = readBool(storage.storageGet(KEY_NO_GUESSING), true);
    this.themeValue = storage.storageGet(KEY_THEME) === 'Flower' ? 'Flower' : 'Classic';
    this.languageValue = resolveLanguage(storage.storageGet(KEY_LANGUAGE), systemLocale);
    const appearance = storage.storageGet(KEY_APPEARANCE);
    this.appearanceValue = appearance === 'light' || appearance === 'dark' ? appearance : 'system';
  }

  get haptics(): boolean {
    return this.hapticsValue;
  }

  set haptics(value: boolean) {
    this.hapticsValue = value;
    this.storage.storageSet(KEY_HAPTICS, String(value));
  }

  get noGuessing(): boolean {
    return this.noGuessingValue;
  }

  set noGuessing(value: boolean) {
    this.noGuessingValue = value;
    this.storage.storageSet(KEY_NO_GUESSING, String(value));
  }

  get theme(): ThemeName {
    return this.themeValue;
  }

  set theme(value: ThemeName) {
    this.themeValue = value;
    this.storage.storageSet(KEY_THEME, value);
  }

  get language(): LanguageCode {
    return this.languageValue;
  }

  set language(value: LanguageCode) {
    this.languageValue = value;
    this.storage.storageSet(KEY_LANGUAGE, value);
  }

  get appearance(): AppearanceMode {
    return this.appearanceValue;
  }

  set appearance(value: AppearanceMode) {
    this.appearanceValue = value;
    this.storage.storageSet(KEY_APPEARANCE, value);
  }
}

function readBool(value: string | null, fallback: boolean): boolean {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}