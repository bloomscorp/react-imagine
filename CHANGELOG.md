# Changelog

## 0.1.0 (unreleased)

First release.

- `<ImagineProvider getSessionToken baseUrl?>`: one Imagine client for the tree.
- `useImagine()`: that client (`@bloomscorp/imagine.js`'s `ImagineBrowser`).
- `useJob(jobId)`: `{ job, images, error, done }`, polling until the job ends and
  stopping on unmount.
- `useCreateJob()`: `{ create, job, pending, error, reset }`.
- React 18 and 19, ESM and CommonJS, a `"use client"` banner for Next.js.
- Re-exports the core's client, `ImagineError` and every type.
