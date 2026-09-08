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

## v0.1.91：阅读缩放与木桌

- 新增 100%–300% 缩放滑杆与加减按钮，以相机缩放保留清晰的 3D 渲染；“恢复全景”重置缩放和查看位置。
- 放大后可使用鼠标或单指拖动查看局部，拖动层隔离翻页点击，翻页仍通过下方按钮和方向键完成。“重新开始”同时重置阅读视图。
- 书本下方增加有厚度的木桌，木纹在本地生成，随书本俯仰角同步调整并接收书本投影；没有新增外部素材或依赖。
- 独立 TypeScript 检查、定向 lint、15 项相关测试和生产构建通过。未改动数据层。
- 实际浏览器检查仍被环境强制安全策略校验阻断；缩放、拖动、窄屏与木桌视觉效果未验证。
- 待验收：缩放上下限、放大后拖动至四角、恢复全景、缩放过程中翻页、触控取消后再次拖动、各视角桌面和书本接触处的阴影。

## v0.1.92：鼠标跟手翻页与缩放事件冲突

- 删除放大时覆盖整个 Canvas 的透明拖动层。普通和放大视图均默认直接命中书页，按下后以指针位移驱动纸张和封面角度。
- 短距离点击自动翻页；拖动不足时回弹，达到阈值后完成翻页，拖回起点可取消。指针捕获保证移出书页后仍跟手，失焦、捕获丢失或 pointercancel 时回弹并释放交互。
- 放大时新增明确的“翻页 / 移动视图”切换；移动在场景容器的捕获阶段处理，避免同一次手势触发翻页。Shift 或鼠标右键拖动也可临时移动视图。
- 拖动范围参考实际投影并限制在视口内，避免 300% 或窄屏下必须拖出窗口才能翻页。翻页中禁止修改缩放、视角和操作方式。
- 19 项相关测试、独立 TypeScript 检查、定向 lint 和生产构建通过。新增回归覆盖双向跟随、拖回、取消、缩放比例以及窄屏可达阈值。
- 实际浏览器交互仍未验证：本次重试也被环境强制安全策略校验阻断。上述自动测试验证运动和释放判定，不等同于真实指针事件与视觉验收。
- 待验收：100%/200%/300% 下拖动左右页和封面；松手完成与回弹；放大时移动视图后切回翻页；按住指针移出画布再释放；失焦与触控取消后继续操作。

## v0.1.93：封底、内书脊与拖动稳定性

- 将封底纳入同一翻页状态流：最后一张内页之后可以翻合封底，封底合上后可以反向重新打开；按钮和鼠标共用相同的边界判定。
- 移除原来低于内页的棕色内书脊柱，改成白色连接带。连接带两侧贴合左右纸叠高度，中线跟随实际翻动书页的铰接高度。
- 正常自动翻页恢复最初的整页 1.08 秒、封面 1.05 秒。松手后的落页与回弹使用相同时长的缓入缓出，取代开头速度过快的指数逼近；保留系统减少动态效果偏好。
- 捕获丢失不再被直接视为取消。翻页由窗口捕获阶段的指针事件维持，按住时无论拖到多远、停留多久都不自动落页或回弹；实际释放、取消或失焦后才结算。移出窗口释放后，返回时也会结束手势。
- 24 项相关测试、独立 TypeScript 检查、定向 lint 和生产构建通过。新增回归覆盖全书封面到封底再返回、端点取消、长按保持、原始时长和白色连接带与书页的接合位置。
- 浏览器工具仍因环境强制安全策略校验失败无法访问本地预览。实际视觉和原生鼠标交互未验证，自动测试不能替代这一验收。

## v0.1.94：薄封面与牛皮 / 布艺

- 封面厚度由 .16 调整为 .05，同时按新厚度更新正反表面、封面落点和桌面高度，减少约 69% 的厚重感。
- 增加“牛皮 / 布艺”选择：本地生成颜色和线性凹凸纹理。牛皮使用细颗粒、低强度清漆与压印文字；布艺使用交错经纬线、高粗糙度和纤维柔光。封底和侧边配色随材质变化。
- 翻动纸张仅保留一个双面阴影投射面，不再让两张重叠网格重复投影或接收自身阴影；封面外壳也不接收自身阴影。适当降低直射光、增强环境光，并使用支持阴影半径的 PCF 过滤减轻硬阴影。
- 25 项相关测试、独立 TypeScript 检查、定向 lint、生产构建通过。厚度回归验证两种静止姿态的封面内侧与纸叠保持间隙。
- 未新增外部依赖或上传用户内容；实际浏览器视觉仍未验证。已有浏览器访问受环境安全校验阻断，本次据用户截图定位后进行代码调整，不能据此宣称异常阴影已获视觉验证。

## v0.1.95：素面皮纹与合拢露白

- 去掉牛皮纹理的周期正弦波和大斑点，改成不周期重复的细颗粒低对比颜色。凹凸强度从 .012 降至 .0015，降低反光，提高粗糙度，使表面更接近均匀的哑光素面皮。布艺也降低织纹反差和凹凸。
- 调整封面转轴高度的时序：封面在纸叠上方旋转时保持足够净空，到空的一侧再降下；封底先升至纸叠上方，再合到左侧，避免近书脊部分穿页。
- 去掉纸叠为空时固定在原处的内衬替身，使用附着在封面上的真实内衬面，并将内衬边缘向内缩进。白色连接带在封面收合期间收起，完全合上后不保留外伸部分；实际纸叠侧边仍保留。
- 26 项相关测试、独立 TypeScript 检查、定向 lint、生产构建通过。新增测试逐步采样封面正反面在整个旋转过程与纸叠的净空，而不只检查静止端点。
- 本次根据用户截图调整，实际浏览器视觉未验证；不能把模型净空测试等同于已确认所有露白或材质观感问题消失。


## v0.1.96 — Main appreciation mode and saved JPG pages

- Main app “欣赏” now uses the same `Book3DView` as `/three-test`, with the wooden desk, drag turns, zoom/pan, thin covers and physical back cover. The 3D bundle loads on demand.
- Real journal spreads/flyleaf map to recto/verso textures; page count and dimensions follow the selected book. Grid selection restores the corresponding spread. Existing editable journal data and save format are unchanged.
- Appreciation, grid thumbnails and non-WebGL fallback display JPGs. JPGs are cached as blobs in browser-local IndexedDB (`shiguang-reading-jpg`), keyed by book/page and a content signature. An unchanged cached page loads without importing the snapshot renderer. Missing/changed pages are rendered once with the existing paper renderer and fonts, encoded at 2000px spread width / JPEG quality .94, then the temporary component tree is unmounted. This is a regenerable browser cache, not a separate backup/export file; unavailable browser storage falls back to generating an in-memory JPG.
- Each 3D book decodes only a small neighborhood of saved JPGs; grid images generate/load near the viewport. Both static and 3D views release temporary object URLs. WebGL creation/context failures fall back to JPG reading.
- Automated coverage: real spread ordering with/without flyleaf, 1–120 body spreads, traversal through the back cover, both book ratios, bounded thickness, JPG content invalidation, cached JPG reuse without a DOM/paper renderer, and existing motion/reading/version regressions.
- Validation: focused TypeScript and lint checks, 31 related tests, production build. Browser visual/drag/JPG fidelity and real IndexedDB persistence remain **unverified**: the browser tool's administrator-policy check is unavailable in this session; no bypass was attempted.


## v0.1.97 — Prevent unconditional fallback and off-canvas JPG capture

- Confirmed the 3D fallback bug against the installed R3F source: `Canvas` always mounts its `fallback` as a native canvas child. The previous `Unavailable` effect therefore called the error callback even with working WebGL. Replaced it with passive text; real render errors/context loss still report through the existing error path.
- Moved the negative off-screen offset to an outer wrapper that is never captured. The captured paper host remains at the origin, and its cloned physical/logical inset properties are reset. This addresses the off-canvas rendering risk observed in the white JPG report; actual JPG fidelity still requires browser validation.
- JPG renderer signature is now 2, so v0.1.96 cached white images are regenerated without clearing journal data. Static fallback exposes the error and provides a 3D retry action.
- Validation: 34 related tests, focused TypeScript/lint and production build. Browser opening was attempted again; the administrator-policy check is still unavailable. Visual output remains unverified; no alternate browser-control workaround was used.


## v0.1.98 — Full-height desk and preloaded JPG reading

- Moved embedded zoom, angle and navigation controls into the title row via a portal. The desk flexes to fill the remaining reading viewport; narrow toolbars scroll horizontally rather than reducing the table height. Experiment layout remains separate.
- Each reading session prepares all saved JPG blobs once before showing the book. Nearby decoded canvases remain bounded, but subsequent turns decode from the in-memory JPG buffer rather than requesting storage/generation again. Disposing the reader releases the buffer.
- The white preparation overlay is restricted to initial loading. Subsequent nearby decoding keeps the rendered book visible; input briefly waits for preparation when needed. First-time generation of a long book may take longer because all JPGs are prepared up front.
- Validation: 37 related checks, focused TypeScript/lint and production build. Actual browser layout and animation remain unverified because this session's browser administrator-policy check is unavailable.


## v0.1.99 — ThreeUI-inspired soft paper comparison

- Only `/three-test` opts into the new soft mode, with a “柔纸曲面 / 原版” switch disabled during a turn. Main appreciation retains the original profile and standard paper materials. Existing pointer release, cancellation, timing, zoom/pan and cover state are reused.
- Adapted ThreeUI Sketchbook's continuous strip-angle profile into the existing length-preserving Three.js mesh. Added subtle orientation-based tone, paper sheen and a feathered gutter shadow that rises and fades with the turning leaf. Source and MIT notice are in `THIRD_PARTY_NOTICES.md`; no upstream artwork is bundled.
- Validation: 33 related tests, focused TypeScript/lint, and production build passed. Soft-profile tests sweep endpoints, segment lengths, hinge heights and curvature across different book dimensions. Full-project TypeScript still reports six errors in the unchanged `components/collage-tools.tsx` (unknown `data`).
- Browser preview was attempted at the existing development server, http://127.0.0.1:4341/three-test. Browser access was denied because its administrator security policy could not be verified. Actual appearance, drag gestures and mobile layout remain unverified; no alternate browser-control route was used.
