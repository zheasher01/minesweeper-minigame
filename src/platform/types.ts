import type { HapticKind } from '../core/index.ts';

export interface ConfirmOptions {
  readonly title: string;
  readonly content: string;
  readonly confirmText: string;
  readonly cancelText: string;
  readonly destructive?: boolean;
}

export interface KeyboardListener {
  input(value: string): void;
  confirm(value: string): void;
  complete(value: string): void;
}

export interface Platform {
  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;
  storageRemove(key: string): void;
  haptic(kind: HapticKind): void;
  copyText(text: string): Promise<void>;
  batteryPercent(): number;
  systemLocale(): string;
  systemTheme(): 'light' | 'dark';
  onHide(listener: () => void): void;
  onShow(listener: () => void): void;
  onThemeChange(listener: () => void): void;
  showToast(text: string): void;
  showActionSheet(items: readonly string[]): Promise<number | null>;
  confirm(options: ConfirmOptions): Promise<boolean>;
  showKeyboard(defaultValue: string): void;
  hideKeyboard(): void;
  onKeyboard(listener: KeyboardListener): void;
}