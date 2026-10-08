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

The adapter was subsequently installed into the user's `web` DSH profile. The installed package is separate from the DSH runtime.

## Integrated personality settings (2026-10-08)

- Strict compilation passed; all 68 upstream fingerprints still matched.
- Six personality tests passed in addition to the seven Windows checks and nineteen upstream integration tests (32 total).
- Checks cover default-off compatibility, input bounds and invalid choices, config schema/live references, session-scoped prompt injection, changes/disable without re-registration, existing emoji policy, stable prompts, browser module loading, and exact client/server preview agreement.
- The personality section is embedded into the existing `clawbot` config form/card. There is no second plugin UI, session or service.
- The final package is `wechat-clawbot-windows-0.9.8-windows.3.tgz`. A distinct version avoids pnpm reusing an earlier local-tarball cache; installed runtime bytes were checked after the final update.
- The package was upgraded in the local `web` profile using the DSH plugin CLI. An online attempt stalled on optional archives for other platforms; the offline retry completed successfully from the existing cache.
- A controlled service reload was required for this package upgrade. Authenticated `settings/describe` then exposed all nine fields, and `settings/update` successfully enabled the warm/familiar defaults. The live plugin logged adoption of `personaEnabled` without restarting its monitor. Existing emoji/model settings were retained.
- The live DSH client bundle was fetched from the resource URL declared in its authenticated index; it returned HTTP 200 and contained the personality component and the same `clawbot` form namespace.
- Actual browser clicking/visual acceptance could not be performed: the browser tool blocked opening the local DSH URL. Module/React-tree checks do not establish visual correctness or model response style.
- No real WeChat message or paid model request was used for these checks. Recent-experience storage and proactive messaging are not implemented in this increment.

## Embedded chatbot-only MemOS (2026-10-08)

- MemOS component pinned to `a7367d07e55db61099f7b4e2c1108bc5831a24f3`; changes apply only to the generated build copy. The 68 original clawbot source fingerprints remain unchanged.
- Strict compilation and 41 tests passed: 22 Windows/personality/memory tests plus 19 original bridge tests. Memory checks include actual SQLite adapter startup and migrations, current producer-owned WeChat messages, accepted post-policy input, notifications, exact session admission, child-tool execution refusal, live switches, and management-route authentication enforcement.
- A public multilingual embedding model loaded on Windows CPU and returned two normalized 384-dimensional vectors. SQLite `12.10.0` and ONNX Runtime `1.30.0` loaded under Node `26.5.1`; sharp `0.35.5` passed actual image-compression checks.
- The workspace production dependency audit reported one low-severity development-server advisory inherited via build-only `tsx`; no moderate/high/critical findings. The runtime package excludes `tsx` and does not run a development server. This is not a claim about every pre-existing dependency of the DSH profile.
- The management route calls DSH Connection's `requestRejection` explicitly; registering a raw WebServer route alone does not authenticate it.
- Original WeChat senders still share one configured main session. Isolation checks cover other DSH sessions and child agents, not individual contacts within that main session.
- Tests use fixtures; no real WeChat message has been sent and no paid model request has been used. Live installation results are recorded separately below.

### Live local installation

- Installed `0.9.8-windows.5` into the existing DSH `web` profile through the DSH plugin CLI. Large ONNX packages required prefetching with an extended timeout before the offline installation; a stale sharp Windows binary from the interrupted attempt was replaced from the matching official package cache.
- The installed profile passed an actual in-memory SQLite query, ONNX module loading, and sharp image encoding. The public multilingual model cache was copied into the installed Transformers package to avoid a first-conversation download.
- A controlled DSH reload succeeded. The authenticated memory endpoint returned `ready`; `settings/describe` exposed the new fields, and `settings/update` enabled `memosEnabled`, `memosRecall`, and `memosCapture` while retaining the enabled personality settings.
- Unauthenticated GET and POST both returned 401. An authenticated foreign-origin POST returned 403. The resource URL in the live authenticated index served the updated existing clawbot client containing the MemOS section.
- An additional local round-trip used real SQLite and the multilingual ONNX model with synthetic Chinese text: capture persisted one record, retrieval returned it, and deletion removed it. The task-owned temporary store was cleaned up; the user's actual store remained empty during validation.
- Actual WeChat delivery, a new real message's automatic capture, and auxiliary model summarization through the user's OAuth route were not exercised by sending test messages. Native persistence/retrieval checks and interface/authentication checks do not establish those end-to-end paths or visual browser rendering.

## Random proactive sharing and early exploration (2026-10-08)

- Final runtime `0.9.8-windows.7` compiled under the original strict settings. All 68 original source fingerprints remained unchanged; MemOS tracked source also remained unchanged. The new module lives in `extensions/proactive/` and integrates only into the generated build copy.
- 55 tests passed: 36 local Windows/personality/memory/proactive checks plus 19 original bridge tests. New checks cover random and overnight windows, idle time, unanswered-share suppression, daily and evaluation caps, article deduplication, durable reservation before network I/O, no retry after uncertain delivery, cancellation for real user input, scoped tools, authenticated rule previews without dispatch, browser component persistence, and private/unreferenced image rejection.
- Early exploration is limited to 0–14 days, persists its start across restarts, and automatically restores regular limits. The exploration test exercises four distinct shares with intervening responses, suppression without a response, the daily cap, and expiry after restart. Separate memory lifecycle checks confirm that proactive instructions/robot commentary are not captured as user experiences while the subsequent real user's reply is captured.
- The final tarball was installed offline through the DSH plugin CLI. A controlled reload succeeded, and installed runtime/engine/policy/browser bytes matched the generated package. Existing SQLite, ONNX and sharp imports were checked after the preceding package upgrade; this final increment changed no native dependencies.
- Live authenticated `settings/describe` exposed all 14 options in the existing `clawbot` namespace. The same existing browser resource served the new component. Unauthenticated GET/POST returned 401, and authenticated foreign-origin POST returned 403. Preview did not change the opportunity time or delivery history.
- Live settings included broad discovery based on real reactions, a configured nearby area, and a seven-day exploration period. Actual exploration bounds are 45–90 minutes and at most four shares per day; regular bounds remain 90–240 minutes and two shares per day. Both use the 10:00–21:30 Asia/Shanghai window, 30-minute post-chat idle time and no-response suppression. Personal preferences remain in the local DSH profile.
- The live scheduler returned `exploration` with a persisted expiry seven days later and an empty delivery ledger during verification. Personality and MemOS remained enabled; the memory service returned `ready` after reload.
- Interest adaptation currently uses model instructions, actual session replies and existing MemOS records, not a separately trained preference scorer. Nearby facts use available DSH web tools; no dedicated map API was installed. Real source photos/charts are prepared for model viewing and sent through the original encrypted WeChat image pipeline; there is no image generation or voice implementation.
- No real WeChat test message or paid model request was made. Network search quality, actual picture delivery, spontaneous writing style and visual browser acceptance were not exercised end to end. Automated tests and live settings/authentication checks do not establish those paths.
