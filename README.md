# Autumn Launcher

Windows x64 极简 Minecraft Java Edition 启动器，基于 Electron、React、TypeScript 和 XMCL。界面素材来自用户提供的 Figma 文件。

## Project overview / application review

Autumn Launcher is an independent Windows x64 desktop launcher for locally installed Minecraft: Java Edition instances. It uses Electron, React, TypeScript, MSAL Node and XMCL. The project is currently in development.

Microsoft sign-in starts from the avatar button and opens Microsoft’s official device-code sign-in page in the system browser. The intended authenticated flow is Microsoft OAuth → Xbox Live → XSTS → Minecraft Services → Java Edition entitlement and player profile checks → launching an installed instance. Microsoft passwords are never requested by the application. MSAL caches are encrypted locally with Electron safeStorage on Windows; access tokens stay in the main process.

**Current status (2026-10-22):** Microsoft browser authorization and Xbox authentication have reached Minecraft Services, which returns HTTP 403 / Invalid app registration. Application access approval is pending. Full account sign-in, refresh and real game launches are not yet verified end to end. The repository includes the actual implementation and 28 automated tests; tests use isolated synthetic authentication responses.

- [Authentication purpose, endpoints and data handling](AUTHENTICATION.md)
- [Validation record and current limitations](VALIDATION.md)
- Source: [electron/](electron/), [src/](src/), [shared/](shared/)
- Build instructions are below. This is a source repository; generated executables and dependencies are excluded.

## 运行

运行 `npm run package` 后，便携版生成于 `release/Autumn-Launcher-0.1.4-x64.exe`；该目录属于构建输出，不包含在源码仓库中。也可运行 `release/win-unpacked/Autumn Launcher.exe`；必须保留同目录内全部文件。

开发环境需要 Node.js 22.12 或更高版本：

```powershell
npm ci
npm run dev
```

生产构建与检查：

```powershell
npm run build
npm test
npm start
npm run package
```

首次使用 Electron 时可能需要下载官方运行时。若网络必须走代理，按 Electron 下载器的说明设置 `ELECTRON_GET_USE_PROXY` 与代理环境变量。

## 使用

1. 点击侧栏 `+`。启动器会扫描 `%APPDATA%\.minecraft` 等常见目录；也可添加包含 `versions`、`libraries`、`assets` 的标准游戏根目录。
2. 选择经过基本完整性校验的已安装版本，输入名称后创建实例。默认生成新的独立目录，分别保存模组、配置和存档。不会把原游戏目录当作实例目录。
3. 点击设置按钮，检测/选择适合该版本的 **Windows x64 Java**，配置内存。空白实例覆盖项会继承全局设置。
4. 点击右上角头像进入微软官方登录流程；登录成功后显示 Java 正版玩家的皮肤头像和名称。
5. 点击右下角启动。左下角显示最新启动日志，窗口就绪后固定为 `Instance is Running.`；失败后固定为 `Launch Failed.`。游戏正常退出后恢复 `Ready to launch.`。点击日志行可打开详细日志。
6. 悬浮实例标题可显示编辑按钮。可以更名、更换图标、覆盖 Java/内存、打开目录、删除记录。删除记录有二次确认，始终保留游戏数据。

## 微软登录配置

**此源码版本未内置已注册的 Microsoft 应用 Client ID。** 它是启动器开发者的应用编号，不是玩家账户、玩家 UUID、邮箱或密码。未配置应用编号时，账号窗口会明确提示，不能完成真实登录。

在全局配置的「游戏目录与应用登录配置」中填写自己的应用 Client ID，或者在首次启动时通过 `MICROSOFT_CLIENT_ID` 环境变量提供。已有配置优先。

应用需允许个人 Microsoft 账户和公共客户端流。登录采用 MSAL 官方设备代码流程，请求 `XboxLive.signin`，然后通过 XMCL 完成 Xbox / Minecraft 令牌交换，再检查 Java 使用资格和玩家档案。Minecraft / Xbox API 是否允许此应用访问还取决于应用的实际注册和平台授权；仅有一个 UUID 形式的编号不代表登录已经通过验证。

用户只在系统浏览器的微软官方页面输入凭据。没有任何收集 Microsoft 密码的表单，也不需要客户端密码。MSAL 缓存和代理密码用 Electron `safeStorage` 在 Windows 上加密保存；令牌不交给 React，也不写入普通配置文件。退出登录会清除本地账号凭据。

参考：[微软应用注册](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)、[设备代码流程](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)、[XMCL 项目](https://github.com/Voxelum/x-minecraft-launcher)。

## 支持范围与数据行为

- 适配标准已安装目录中的 Minecraft 1.18–1.21.x，包括 Vanilla、Fabric、NeoForge。通过实际解析的加载器依赖和主类识别，不能识别的自定义版本会说明原因。
- 版本扫描验证 JSON 继承、客户端、依赖和资源；启动前进一步进行校验。成功启动标记依据 XMCL 的游戏窗口就绪日志事件，未使用等待若干秒即成功的计时器。
- 缺失的依赖和资源由 XMCL 解析下载清单，经启动器网络会话下载并校验。百分比来自当前批次已完成文件数，批次变化可重置。不可量化阶段显示不确定进度动画。
- 自动修复只补齐缺失文件。已有文件损坏、客户端 JAR 缺失或加载器处理未完成时，提示使用原安装器修复，不覆盖已有资源。不提供完整游戏版本下载商店。
- 代理配置影响启动器登录和资源下载，不代理 Java 游戏流量。HTTP 支持账号密码；SOCKS5 目前只支持无认证代理。
- 默认配置在 `%APPDATA%\autumn-minecraft-launcher`。`config.json` 保存配置与实例记录；`account.bin` / `proxy.bin` 是加密凭据；`icons` 保存复制后的图标；`logs` 保存启动日志；`instances` 是默认实例数据位置。
- 更改默认实例位置不移动现有实例；删除记录不删除目录。现有配置损坏时会停止并提示，避免静默覆盖。
- 关闭启动器不会主动结束游戏，但会停止当前进程跟踪和新日志记录。重新打开不会接管之前的游戏进程。

## 验证与限制

详见 [VALIDATION.md](VALIDATION.md)。**微软账号完整授权、Vanilla/Fabric/NeoForge 的真实游戏启动尚未完成实测，不能据此视为已满足全部 MVP 验收。**

无广告、遥测、市场、离线假登录或模拟下载进度。便携版没有代码签名证书。

## 依赖兼容修复

依赖使用锁文件固定。XMCL 核心 2.16.2、安装器 6.3.6、用户模块 4.4.2，均为 MIT 许可；MSAL Node 7.1.0。

这些 XMCL 发行包存在三处发布元数据问题，已做范围很小的兼容处理：

- `overrides` 将 unzip 的 `workspace:^*` 依赖指向已发布的 `@xmcl/yauzl@2.10.0`。
- `postinstall` 修复 `@xmcl/unzip@2.2.0` 指向未发布 TypeScript 源文件的入口，改为其已有 `dist` 文件。
- 安装器引用未发布的 `@xmcl/core/utils` 子路径；兼容脚本恢复上游源码中相同的 `isNotNull` 函数。游戏解析、校验、认证和启动逻辑均使用 XMCL。

后续升级 XMCL 时应重新检查这些修复是否仍需要。

### AADSTS70002 / Invalid URL

0.1.3 已修复将微软失败响应误当作授权成功响应的问题。若提示 AADSTS70002，请进入 Entra「应用注册 → Autumn Launcher → Authentication (Preview) / 身份验证」，将「Allow public client flows / 允许公共客户端流」设为 Yes 并保存；界面也可能显示「Enable the following mobile and desktop flows」。此配置必须在应用注册中修改，更新启动器本身无法绕过微软服务器的拒绝。

### Minecraft 登录 HTTP 403

浏览器的微软授权成功，仍可能在后续 Minecraft 登录接口被拒绝。新应用需另外申请 Minecraft API 访问资格；注册 Client ID 和打开公共客户端流并不等于已取得此资格。可通过 [Minecraft 应用访问申请](https://aka.ms/mce-reviewappid) 提交启动器的应用信息，参考 [minecraft-launcher-lib 的开发者文档](https://minecraft-launcher-lib.readthedocs.io/en/stable/tutorial/microsoft_login.html#apply-for-permission)。

0.1.4 按实际失败的接口分别显示 Xbox 用户验证、设备验证、XSTS、Minecraft 登录、正版资格和玩家档案错误。仅在 Minecraft 登录接口返回 HTTP 403 且响应明确包含 `Invalid app registration` 时，才确定提示应用注册被拒绝；其他 403 保留原因未明确的说明。Xbox 的数字 XErr 会保留，原始服务响应、令牌和身份字段不会进入错误提示。应用审批由平台决定，此修复不代表已解除服务端 403。
