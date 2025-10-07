# Maintenance Tasks

## Typo Fix
- [ ] Update the head comment in `index.html` to say "in-browser JSX transpilation" instead of "in-browser JSX transpile"; the current wording is grammatically incorrect and reads like a typo in the documentation header. 【F:index.html†L1-L12】

## Bug Fix
- [ ] Wire the user-provided API key from the settings modal into `safeFetchWithRetry` so requests no longer use the hard-coded empty key, which currently causes Gemini calls to fail with authentication errors. 【F:index.html†L149-L203】【F:index.html†L669-L688】

## Comment / Documentation Discrepancy
- [ ] Adjust the API key helper text in the settings modal to reflect that the user must supply a key (or that the app cannot function without it) because the present copy claims the runtime manages keys automatically, which is misleading. 【F:index.html†L669-L688】

## Test Improvement
- [ ] Add automated tests around the `TaskQueue` class to verify concurrency limits and completion callbacks, since this scheduling logic currently lacks coverage despite coordinating asynchronous image generation. 【F:index.html†L120-L146】【F:index.html†L209-L220】
