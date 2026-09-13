# 介绍页素材

本页入口为 `/intro/index.html`，是一张独立静态介绍页，不载入编辑器脚本、不访问资料 API，也不保存示意交互。正式服务与开发服务均可按此地址打开；版本标签在生产构建时由 `local/stamp-dist.mjs` 从 `package.json.version` 注入，源 HTML 不手写版本号。

- `summer-journal.webp`：2026-09-13 使用内置 imagegen 生成的原创氛围示意图，经 WebP 压缩。提示词主题：俯拍奶油色纸本旅行手帐，海湾与橙子照片、植物和复古邮票的克制拼贴，亚麻桌面与自然晨光，独立生活杂志摄影；无设备框、无网站界面。它不是 App 截图，页面已标注为手帐氛围示意。
- 花卉 `../materials/asset-004-cut.png`、蝴蝶 `../materials/asset-053-cut.png`、邮票 `../materials/asset-069-cut.png`：复用项目内置素材，来源、作者及 Public domain 声明详见 `../materials/manifest.json` 对应条目；原图及素材库记录未修改。
- `../fonts/script.woff2`：项目已收录的 Caveat 字体，SIL OFL 1.1，许可见 `../fonts/caveat-OFL.txt`。

功能示意中的日志为虚构内容。介绍页功能文案依据当前 README 与编辑器入口核对。手机可以浏览介绍页，App 仍面向 Mac 与 Windows 电脑；AI 需要用户自行配置模型服务。
