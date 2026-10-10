# 拾光介绍与下载页

`index.template.html` 是独立静态页面，展示已存在的手帐功能、Mac 测试版要求和素材导入说明。不连接用户数据、不调用 AI、不依赖外部字体或脚本。

生成前先执行 `npm run desktop:mac`，保证应用 ZIP 与 `package.json` 同版本；再运行：

```sh
node desktop/package-intro.mjs build/shiguang-materials-2026-10-09.zip
```

输出为 `build/shiguang-intro-v<当前版本>/`，包含 `index.html`、公共插画、两个下载 ZIP、校验清单和使用说明。页面版本及下载大小由脚本读取。当前文案对应已核对的 411 件素材合集；更换合集时应同时核对数量和介绍。

分享时发送整个输出目录的 ZIP，解压后打开 `index.html`。网页按钮使用相对路径，不能只发送 HTML。也可将整个目录部署到静态站点，但需选择支持应用 ZIP 大小的文件存储；本脚本不会上传或发布文件。

用户素材与应用构建产物仅留在被忽略的 `build/`，不提交 GitHub。手帐编辑器、存储与现有启动流程不受影响。
