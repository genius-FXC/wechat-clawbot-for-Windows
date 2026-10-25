# Windows companion update: windows.7 → windows.21

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
