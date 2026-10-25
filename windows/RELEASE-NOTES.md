# Windows companion update: 1.3.0-windows.1

## Upstream 1.3.0 integration

The fork merges upstream `main` at `a7bc922f6eaa7d5a8c6d4e468f725631d0bbbfc7`. All 80 pinned upstream files match that revision; modifications are confined to the generated build, adapter, and extension layers. The author repository is not modified.

New upstream behavior includes message coalescing, durable deferred delivery, DSH session tools and notifications, singleton takeover, and time-context corrections. The Windows layer preserves stdio/named-pipe handling, image processing, personality, owner-scoped memory, proactive sharing, literature reading, and the independent recommender. Native macOS calendar/alarms/secretary support remains off and unavailable on Windows.

Integration guards keep a proactive producer separate from human message batches, cancel background sharing on incoming human text, and exclude it from automatic user-memory capture. Settings grouping uses labels and retains unknown fields under Advanced so additions from upstream cannot silently disappear.

The combined build has its own Windows tests. `npm run test:upstream` runs the upstream static/integration suite on a separate pristine pinned copy because those checks intentionally do not recognize third-party extension source shapes. It uses synthetic state and file-URL handling on Windows; the POSIX Claude-discovery fixture and three POSIX mode-bit assertions are explicitly skipped there, not counted as passes. Windows discovery, recipient persistence, route authentication, and unsupported-native-operation guards have separate combined-build coverage. These checks do not claim native macOS or phone-delivery acceptance.

## Earlier companion update: windows.7 → windows.21

This update keeps all 68 pinned upstream files unchanged. New behavior is implemented in `extensions/` and assembled by the Windows build layer.

## Literature workbench

- Read-only local Zotero collections, paginated searches, and registered PDF attachments, including standalone PDFs.
- Reading rules supplied by the user, staged reading and continuation, figures and selected supplementary material, and bounded report review.
- Chinese PDF and Markdown exports with math rendering, delivery-size splitting, durable progress, and draft reuse after export failure.
- Owner-scoped WeChat tools and authenticated local management routes; original PDFs and Zotero records are preserved.

## Independent paper recommendations

`extensions/recommender/` builds a separate DSH plugin. It uses library metadata and explicit requests to search arXiv, deduplicates results, and records interested/read/not-interested feedback. It does not provide a full-library full-text vector index, automatically import papers, or send scheduled recommendations.

## Proactive sharing and settings

- Restore evaluation opportunities after a new human message without removing daily send limits or quiet hours.
- Preserve the proactive timer when unrelated settings change, and display current gates and counts.
- Read verified public sources and images through a local Windows HTTP proxy while retaining public-IP checks, redirect validation, and HTTPS identity checks.
- An explicitly started, bounded content experience schedules ten random opportunities within an hour. Opportunities may be skipped when reliable content is unavailable. Uncertain deliveries are not replayed after restart; pending opportunities can be cancelled.
- Group settings into literature, personality/memory, proactive interaction, model/connection, and advanced controls, with keyword filtering.

## Verification and privacy

Run `npm test` from `windows/` and `npm test` from `extensions/recommender/`. The Windows build verifies the pinned upstream manifest before and after integration. Unit tests use synthetic fixtures and simulated transports; optional live/soak scripts use the operator's local library or current model and can consume quota. They do not constitute phone-delivery or browser-visual acceptance.

No source PDFs, exported reports, private reading rules, Zotero database, chat history, account settings, tokens, local diagnostic logs, or model caches are part of this source release. Runtime files belong in the ignored `.local/` or `windows/.build/` directories, or in the operator's external DSH profile. The unpacked root `package/` directory is a local artifact and must not be staged. Keep local validation journals private and use explicit file selection when committing.

Voice, generated images, automatic OCR, and a verified fix for any particular OAuth login failure are outside this update. Model requests continue to use the host DSH route and its existing authorization.
