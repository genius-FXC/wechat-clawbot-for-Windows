# Windows validation

Validated on Windows with Node.js 26.5.1, against the upstream revision recorded in `upstream.json`.

- TypeScript compilation passed with the original strict compiler settings.
- All 68 tracked upstream files matched their normalized SHA-256 fingerprints before and after the build.
- 7 Windows-specific checks passed: package/browser registration, transport defaults, paths containing spaces and shell metacharacters, npm shim resolution, named-pipe validation, explicit CLI paths, and actual image compression.
- All 19 upstream Codex bridge integration tests passed with only their generated platform fixtures adapted. No cases were skipped or removed.
- The installed Windows Codex executable completed a real stdio handshake and a read-only `thread/list` request. No conversation was started or modified, no model request was made, and no account or conversation contents were logged.
- The runtime package was generated as `wechat-clawbot-windows-0.9.8-windows.1.tgz`.
- That tarball was installed into an isolated npm project; its main module, plugin apply function, manifest and browser-module registration loaded successfully.

Still requiring environment-specific acceptance: real WeChat QR login and delivery; Claude CLI/session integration; a real desktop Codex server exposing a shared named-pipe WebSocket endpoint; image formats unsupported by the installed sharp codecs. Passing a synthetic named-pipe test is not evidence that a particular desktop application exposes that endpoint.

The adapter has not been enabled in the user's running DSH profile. The existing Whale and DSH installations are unchanged by this work.
