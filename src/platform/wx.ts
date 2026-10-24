import type { HapticKind } from '../core/index.ts';
import type { KeyboardListener, Platform } from './types.ts';

const VIBRATION: Record<HapticKind, 'light' | 'medium' | 'heavy'> = {
  light: 'light',
  heavy: 'heavy',
  success: 'medium',
  failure: 'heavy',
};

interface ThemeApi {
  onThemeChange?: (listener: (result: { theme?: string }) => void) => void;
}

export function createWxPlatform(): Platform {
  return {
    storageGet(key) {
      try {
        const value: unknown = wx.getStorageSync(key);
        return typeof value === 'string' && value.length > 0 ? value : null;
      } catch (error) {
        console.warn('storageGet failed', key, error);
        return null;
      }
    },
    storageSet(key, value) {
      try {
        wx.setStorageSync(key, value);
      } catch (error) {
        console.warn('storageSet failed', key, error);
      }
    },
    storageRemove(key) {
      try {
        wx.removeStorageSync(key);
      } catch (error) {
        console.warn('storageRemove failed', key, error);
      }
    },
    haptic(kind) {
      wx.vibrateShort({ type: VIBRATION[kind], fail: () => undefined });
    },
    copyText(text) {
      return new Promise((resolve, reject) => {
        wx.setClipboardData({
          data: text,
          success: () => resolve(),
          fail: (error) => reject(new Error(error.errMsg)),
        });
      });
    },
    batteryPercent() {
      try {
        const level = Number(wx.getBatteryInfoSync().level);
        return Number.isFinite(level) ? Math.min(100, Math.max(0, Math.round(level))) : 100;
      } catch {
        return 100;
      }
    },
    systemLocale() {
      try {
        return wx.getAppBaseInfo().language || 'zh_CN';
      } catch {
        return 'zh_CN';
      }
    },
    systemTheme() {
      try {
        return (wx.getAppBaseInfo() as { theme?: string }).theme === 'dark' ? 'dark' : 'light';
      } catch {
        return 'light';
      }
    },
    onHide(listener) {
      wx.onHide(listener);
    },
    onShow(listener) {
      wx.onShow(() => listener());
    },
    onThemeChange(listener) {
      const api = wx as unknown as ThemeApi;
      if (typeof api.onThemeChange === 'function') {
        api.onThemeChange(() => listener());
      }
    },
    showToast(text) {
      wx.showToast({ title: text, icon: 'none', duration: 1500 });
    },
    showActionSheet(items) {
      return new Promise((resolve) => {
        wx.showActionSheet({
          itemList: items.slice(),
          success: (result) => resolve(result.tapIndex),
          fail: () => resolve(null),
        });
      });
    },
    confirm(options) {
      return new Promise((resolve) => {
        wx.showModal({
          title: options.title,
          content: options.content,
          confirmText: options.confirmText,
          cancelText: options.cancelText,
          confirmColor: options.destructive === true ? '#FF3B30' : '#007AFF',
          success: (result) => resolve(result.confirm),
          fail: () => resolve(false),
        });
      });
    },
    showKeyboard(defaultValue) {
      wx.showKeyboard({
        defaultValue,
        maxLength: 24,
        multiple: false,
        confirmHold: false,
        confirmType: 'done',
        keyboardType: 'text',
      });
    },
    hideKeyboard() {
      wx.hideKeyboard({ fail: () => undefined });
    },
    onKeyboard(listener: KeyboardListener) {
      wx.onKeyboardInput((result) => listener.input(result.value));
      wx.onKeyboardConfirm((result) => listener.confirm(result.value));
      wx.onKeyboardComplete((result) => listener.complete(result.value));
    },
  };
}