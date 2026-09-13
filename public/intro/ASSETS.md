# 介绍页素材

本页入口为 `/intro/index.html`，是一张独立静态介绍页，不载入编辑器脚本、不读取手帐或照片 API、不保存展示交互。仅在本机地址检查同源 `/api/health`，确认拾光运行后展示进入按钮；不探测其他地址或端口，不负责安装、启动程序。正式服务与开发服务均可按此地址打开；版本标签在生产构建时由 `local/stamp-dist.mjs` 从 `package.json.version` 注入，源 HTML 不手写版本号。

## 真实 App 截图

以下四张图于 2026-09-13 在拾光 v0.1.248 的真实浏览器界面中截取，视口为 1440 × 960。保留完整界面，仅转为 WebP；未绘制或改写截图中的控件。图片里的版本是拍摄时版本，介绍页版本由当前构建注入。

- `screenshots/editor.webp`：笔记编辑，选中文字，展示字体工具、跨页与图层列表。
- `screenshots/material-studio.webp`：素材工作台，展示实际自动识别产生的蝴蝶候选和手动选择状态；尚未执行入库。
- `screenshots/photos.webp`：照片库，展示日期分组、缩略图和两张照片的多选状态。
- `screenshots/reading.webp`：欣赏页面，展示同一本手帐的真实 3D 阅读界面。

拍摄使用独立演示资料与配置目录；“九月 · 慢慢生活”的文字、排版均为虚构示例，不含用户私人记录。照片经真实照片导入接口加入演示库，示例手帐经原有保存接口写入，截图来自 App 实际渲染。

截图内照片及素材来源：

- 湖畔照片：Patricia Acordi，[Green Mountains by the Lake](https://www.pexels.com/photo/green-mountains-by-the-lake-20520357/)，Pexels 页面标示 Free to use。
- 咖啡照片：Beyza Erdem，[Cup of Coffee on Top of a Round Wooden Table](https://www.pexels.com/photo/cup-of-coffee-on-top-of-a-round-wooden-table-12644355/)，Pexels 页面标示 Free to use。
- 花卉、植物、蝴蝶、邮票：项目内置 `asset-001`、`asset-004`、`asset-053`、`asset-069` 原图和裁片；来源、作者及 Public domain 声明详见 `../materials/manifest.json` 对应条目。原图和正式素材库记录未修改。

## 保留的初版资产

`summer-journal.webp` 是 2026-09-13 使用内置 imagegen 生成的原创纸本手帐氛围图。本轮已从介绍页撤下，保留原资产，当前首屏与四个使用场景均展示真实 App 截图。

功能文案及启动文件名依据当前代码和启动器核对。手机可浏览介绍页，App 面向 Mac 与 Windows 电脑；AI 为可选功能，需要用户自行配置模型服务。

交付时核对 GitHub 仓库为 PRIVATE；介绍页不提供公开 ZIP 下载链接，明确安装文件由作者提供。项目说明链接注明需要访问权限，不改变仓库可见性。
