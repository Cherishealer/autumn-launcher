# Authentication and Minecraft API access

## Application and purpose

Autumn Launcher is an independently developed Windows desktop launcher for Minecraft: Java Edition. It is a personal practice project, strictly non-commercial, and will not charge fees in any form. It manages locally installed Vanilla, Fabric, Forge and NeoForge instances with separate game directories. These launch paths are implemented, but real game launches have not yet completed end-to-end validation. The project is not affiliated with or endorsed by Mojang or Microsoft.

Minecraft service access is required to authenticate players who have legitimate Java Edition access, verify their game entitlement and obtain their Minecraft profile and skin for the launcher interface. The launcher does not offer offline identities as a substitute for authentication or distribute a bundled Minecraft client.

## Sign-in flow

1. The player clicks the avatar button. MSAL Node requests a device code from Microsoft's consumer authority using the launcher's configured application Client ID and the XboxLive.signin scope.
2. The system browser opens the official Microsoft device-code verification page. The player enters credentials only on Microsoft's site.
3. XMCL exchanges the resulting Microsoft access token through Xbox Live user/device authentication and XSTS authorization, then requests a Minecraft Services access token.
4. The launcher checks Minecraft Java Edition entitlements and retrieves the player profile. Only after successful checks are credentials available to the game launch path.
5. The active Minecraft skin is fetched from textures.minecraft.net to display the player's face. Failure to fetch a skin does not invalidate a successful login.

The Client ID identifies the launcher application. A production distribution should use the developer's approved application registration; players should not need their own registrations. The current source build leaves the ID configurable in settings or through MICROSOFT_CLIENT_ID for developer setup. No client secret is required by this public-client device-code implementation.

## Services used

| Service | Purpose | Implementation |
| --- | --- | --- |
| login.microsoftonline.com/consumers | Device-code OAuth sign-in and silent refresh through MSAL | electron/auth.ts, electron/network.ts, electron/oauth-response.ts |
| user.auth.xboxlive.com/user/authenticate | Xbox user authentication | XMCL via electron/auth.ts |
| device.auth.xboxlive.com/device/authenticate | Xbox device authentication | XMCL via electron/auth.ts |
| xsts.auth.xboxlive.com/xsts/authorize | Xbox authorization for Minecraft; optional Xbox authorization | XMCL via electron/auth.ts |
| api.minecraftservices.com/authentication/login_with_xbox | Minecraft access-token exchange | electron/auth.ts |
| api.minecraftservices.com/entitlements/mcstore | Minecraft Java entitlement verification | electron/auth.ts |
| api.minecraftservices.com/minecraft/profile | Player UUID, name and skin metadata | electron/auth.ts |
| textures.minecraft.net | Player skin image | electron/auth.ts |

## Local data handling

- The application has no Microsoft password entry form. Access tokens are not exposed to the React renderer.
- MSAL cache and the player profile are saved in account.bin using Electron safeStorage encryption on Windows. Proxy credentials, if configured, are encrypted separately in proxy.bin. Ordinary settings are stored in config.json.
- Files reside under the application's local user-data directory. They are not part of this repository.
- Logout clears the in-memory account/token and removes the stored account credentials.
- The launcher has no analytics or advertising integrations. Game launch logs redact credentials. Authentication failures expose fixed stage descriptions, HTTP status codes and numeric Xbox XErr values, rather than raw service response bodies.

## Approval and validation status

As of 2026-10-22, the developer's sign-in attempt reaches Minecraft Services and receives HTTP 403 with Invalid app registration. Minecraft API application access approval is pending. This repository does not claim that the application has been approved or that complete account sign-in and game launch have passed live validation.

The 38 automated tests include the actual installed MSAL and XMCL implementations with synthetic HTTP responses to cover device-code handling, cancellation, Xbox/Minecraft exchange failures, stage-specific diagnostics and sensitive-response redaction. These tests are separate from live account approval and game-launch acceptance.

## Code references

- [Sign-in, entitlement checks, profile and logout](electron/auth.ts)
- [Stage-specific Xbox/Minecraft error handling](electron/minecraft-auth.ts)
- [Microsoft OAuth response validation](electron/oauth-response.ts)
- [Encrypted local storage](electron/storage.ts)
- [Game launch credentials and log redaction](electron/launcher.ts)
- [Authentication regression tests](tests/auth.test.ts) and [XMCL exchange tests](tests/minecraft-auth.test.ts)
