import { createWxPlatform } from './platform/wx.ts';
import { App } from './ui/app.ts';
import type { AppEnv } from './ui/app.ts';
import type { Timers } from './ui/gestures.ts';
import { uiScaleFor } from './ui/metrics.ts';
import { HomeScreen } from './ui/screens/home.ts';
import { HistoryStore } from './ui/session.ts';
import { Settings } from './ui/settings.ts';

const platform = createWxPlatform();
const windowInfo = wx.getWindowInfo();
const screenWidth = windowInfo.windowWidth;
const screenHeight = windowInfo.windowHeight;
const dpr = windowInfo.pixelRatio > 0 ? windowInfo.pixelRatio : 2;
const uiScale = uiScaleFor(screenWidth, screenHeight);
const width = screenWidth / uiScale;
const height = screenHeight / uiScale;
const safeTop = (windowInfo.safeArea ? windowInfo.safeArea.top : 20) / uiScale;
const safeBottom = windowInfo.safeArea ? Math.max(0, screenHeight - windowInfo.safeArea.bottom) / uiScale : 0;

// Align the nav bar with the WeChat capsule button so nothing hides under it.
let navTop = safeTop + 4;
let navHeight = 32;
try {
  const menu = wx.getMenuButtonBoundingClientRect();
  if (menu && menu.height > 0) {
    navTop = menu.top / uiScale;
    navHeight = menu.height / uiScale;
  }
} catch {
  // Older base libraries: keep the safe-area fallback.
}

const canvas = wx.createCanvas();
// Back the canvas with physical pixels; every frame resets the transform to
// dpr * uiScale so drawing stays sharp at the device's native resolution.
canvas.width = Math.round(screenWidth * dpr);
canvas.height = Math.round(screenHeight * dpr);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
const pixelScale = canvas.width / width;
console.info('[display]', { screenWidth, screenHeight, dpr, uiScale, canvas: canvas.width + 'x' + canvas.height });

const timers: Timers = {
  set: (task, ms) => setTimeout(task, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const env: AppEnv = {
  platform,
  settings: new Settings(platform, platform.systemLocale()),
  history: new HistoryStore(platform),
  timers,
  width,
  height,
  safeBottom,
  pixelScale,
  navTop,
  navHeight,
  now: () => Date.now(),
  requestFrame: (callback) => {
    requestAnimationFrame(callback);
  },
};

const app = new App(env, ctx);
app.push(new HomeScreen(app));

interface TouchPoint {
  identifier: number;
  clientX: number;
  clientY: number;
}

interface TouchEventLike {
  touches: TouchPoint[];
  changedTouches: TouchPoint[];
}

wx.onTouchStart((raw) => {
  const event = raw as unknown as TouchEventLike;
  app.tracker.prune(event.touches.map((touch) => touch.identifier));
  for (const touch of event.changedTouches) {
    app.tracker.start(touch.identifier, touch.clientX / uiScale, touch.clientY / uiScale);
  }
});
wx.onTouchMove((raw) => {
  const event = raw as unknown as TouchEventLike;
  for (const touch of event.changedTouches) {
    app.tracker.move(touch.identifier, touch.clientX / uiScale, touch.clientY / uiScale);
  }
});
wx.onTouchEnd((raw) => {
  const event = raw as unknown as TouchEventLike;
  for (const touch of event.changedTouches) {
    app.tracker.end(touch.identifier);
  }
});
wx.onTouchCancel(() => app.tracker.cancel());