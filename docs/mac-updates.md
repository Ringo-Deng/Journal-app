# Mac 更新提醒

从 0.1.278 起，Apple 芯片 Mac 打包版启动约 10 秒后检查更新；也可在菜单“拾光手帐 → 检查更新”手动检查。新版提示提供“下载新版”和“稍后”，下载由默认浏览器处理。自动检查失败时保持安静，手动检查失败会提示重试。

旧版用户须先从介绍页下载一次带此功能的版本。下载后正常退出应用，等待保存完成，再解压并替换原 `.app`。资料仍在 `~/Library/Application Support/ShiguangJournalDesktop/`，无需删除或搬动；本功能不写入应用包或用户资料，不自动退出、安装或重启。现有 Apple 芯片、macOS 26+ 与未公证测试包限制仍适用。

## 发布

Mac 独立读取 `https://ringo-deng.github.io/Journal-app/mac-update.json`，不使用 Windows 的 latest.yml 或 GitHub 最新发布号。清单只含 `version`（三段数字版本）与 `arch: "arm64"`；下载地址由程序按仓库固定路径生成，不接受远端任意链接。

1. 按项目规则测试、打包，验证解压副本的启动与菜单，核对构建版本。
2. 发布 GitHub Release `v{version}`，上传 `shiguang-journal-v{version}-mac-arm64.zip` 与校验文件，确认公开下载可用。
3. Mac 单独发布时设置 `--latest=false`，保留 Windows 当前带有安装包和 latest.yml 的最新发布。
4. 最后更新 gh-pages 的 `mac-update.json` 与介绍页 Mac 链接。示例：`{"version":"0.1.278","arch":"arm64"}`。只在文件上传完成、Release 已公开后更新清单；无需在 main 再维护一份手写版本清单。

清单回退到较旧版本不会引起降级提示。开发模式及设置 `SHIGUANG_DESKTOP_TEST_DIR` 的隔离测试默认不访问更新服务。后续若增加 Intel 或更改版本命名规则，须先扩展清单与校验，不能直接指向其他平台安装包。
