# 扫雷 · 微信小游戏

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg?style=flat&logo=typescript)
![Platform](https://img.shields.io/badge/Platform-微信小游戏-07C160.svg?style=flat&logo=wechat)
![License](https://img.shields.io/badge/License-GPL_v3-red.svg?style=flat)

基于 [Nanagokyuu/Minesweeper](https://github.com/Nanagokyuu/Minesweeper)（SwiftUI + Rust 的 iOS 扫雷）移植的微信小游戏版本。游戏核心用 TypeScript 重写，与原版共用同一套测试向量，保证相同种子在两端生成完全一致的棋盘。

## 功能

- **四种难度**：简单 9×9、普通 12×12、困难 16×16；长按首页炸弹 5 秒进入地狱模式（30×24，200 个雷）
- **种子系统**：相同种子 + 相同首发位置生成相同棋盘，可复制种子与好友公平对决
- **无猜模式**：用约束传播求解器校验局面，保证全程可逻辑推导（地狱难度除外）
- **挖雷 / 插旗** 模式切换、点击已翻开的数字快速展开周围格子
- **历史记录与回放**：保存对局，支持置顶、倍速回放
- **设置**：简体中文 / 繁体中文 / English、浅色 / 深色 / 跟随系统、多套主题皮肤、震动反馈
- **适配**：按设备像素比渲染保证清晰，大屏机型（Plus / Pro Max）整体等比放大

## 项目结构

```
src/
  core/        游戏核心：棋盘、RNG、布雷、求解器、回放、历史（与平台无关）
  platform/    微信 API 适配（存储、剪贴板、震动、键盘）
  ui/          Canvas 渲染、手势、多语言、主题
    screens/   首页、游戏、历史、回放、设置
  main.ts      入口：创建画布、计算缩放、绑定触摸事件
tests/         单元测试、UI 测试、与原版 Rust 核心的差分测试向量
minigame/      微信开发者工具项目目录（打包产物输出到 minigame/js/）
```

## 开发

需要 Node.js 22.6+（测试直接运行 `.ts` 文件）和 [微信开发者工具](https://developers.weixin.qq.com/minigame/dev/devtools/download.html)。

```bash
npm install
npm run check    # 类型检查 + 测试 + 打包
```

单独执行：

```bash
npm run typecheck   # tsc 类型检查
npm test            # node --test 运行全部测试
npm run build       # esbuild 打包到 minigame/js/main.js
```

打包后在微信开发者工具中导入 `minigame/` 目录，点「编译」预览；真机测试用「预览」或「真机调试」扫码。

> `minigame/project.config.json` 中的 `appid` 是作者的小游戏 AppID。自己发布时请换成你的 AppID，或导入时选择测试号。

## 许可证

本项目沿用原项目的 [GNU GPL v3](LICENSE) 许可证。