# 3D 翻页实验

入口：应用启动后的 `/three-test`。本页使用独立生成的示例内容，不读取或修改用户手帐。

## v0.1.90

- 保留现有 Three.js / React Three Fiber 实现，封面和封底使用有厚度的网格。
- 8 张双面纸张可连续向前、向后翻阅；点击封面或按钮打开，回到第一页后可合上。
- 纸张按等长分段积分弯曲，书脊横坐标固定；落点跟随对应纸叠高度。
- 左右纸叠随翻阅变化，增加纸边细线、纸纹、封面文字和柔和阴影。
- 支持左右方向键、视角滑杆、首尾边界和动画期间防重复触发；尊重减少动态效果偏好。
- 相机按画布宽高比适配完整跨页。

## 自动检查

```sh
node --experimental-strip-types --test tests/book3d-motion.test.mjs tests/page-motion.test.mjs tests/reading-back-cover.test.mjs tests/reading-format-fit.test.mjs tests/version-display.test.mjs
npx --no-install oxlint components/book3d/Book3DTest.tsx lib/book3d-motion.ts tests/book3d-motion.test.mjs
npm run build
```

几何回归覆盖全部 8 张纸的首尾落点、翻动期间的分段长度、书脊位置以及导航边界。

## 本次验证记录

- 相关 15 项测试通过；新增组件和运动模块独立 TypeScript 检查通过；定向 lint 和生产构建通过。
- 全量测试：192 项，180 通过，12 失败。基线 `6eb7db8`：189 项，177 通过，相同的 12 项失败；没有新增失败。
- 全项目 TypeScript 检查仍受未修改的 `components/collage-tools.tsx` 中 6 处 unknown 类型错误影响。
- 浏览器检查未完成：浏览器工具无法验证环境强制安全策略，未获准访问本地预览。不能把几何测试或构建结果视为视觉验收。

## 待视觉验收

1. 桌面打开封面，逐页翻到末页再返回，确认双面文字方向、无闪页、无穿模。
2. 点击页面和方向键翻页；连续快速输入时保持每次一页，首尾按钮正确禁用。
3. 调整视角到 0°、28°、48°，检查纸叠、书脊连接及投影。
4. 390px 窄屏检查完整书本可见、按钮可用；横竖屏切换后保持当前页。
5. 减少动态效果偏好开启时检查短过渡，翻阅途中离开页面后重新进入检查资源释放。
