# Releasing `@bloomscorp/react-imagine`

## Publish the core first

This package is built on `@bloomscorp/imagine.js` and declares it as a **peer**
(`^0.1.0`). Publish the core first (its own `RELEASING.md`).

Until then, `package.json` points the dev dependency at the local copy beside this
repository:

```json
"devDependencies": { "@bloomscorp/imagine.js": "file:../imagine.js" }
```

That is for development only: the core must be built there (`npm run build` in
`../imagine.js`) before tests or builds here. CI and the release workflow refuse to
run with a `file:` core, so switch before the first push:

```bash
npm install -D @bloomscorp/imagine.js@^0.1.0    # once the core is on npm
npm ci && npm run lint && npm test && npm run build && npm run verify:package
git commit -am "build: use the published @bloomscorp/imagine.js"
```

## How it works

Pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`, which:

1. checks that npm is new enough for trusted publishing (≥ 11.5.1)
2. refuses a `file:` core
3. runs `npm ci`, `lint`, `test`, `build` and `verify:package`
4. checks the tag equals `package.json`'s version
5. publishes with `npm publish --provenance --access public`; a prerelease
   (`0.2.0-rc.1`) goes to the `next` dist-tag; a version already on npm is skipped
6. creates the GitHub release

There is **no publish secret**. npm trusts the workflow through a trusted publisher
(OIDC). The GitHub release uses `GITHUB_TOKEN`.

CI tests every push on Node 20, 22 and 24, each with React 18 and 19.

## One-time setup (owner)

1. Publish `@bloomscorp/imagine.js` and switch the dev dependency (above).

2. Create the empty GitHub repository `bloomscorp/react-imagine`, then push:

   ```bash
   git remote add origin git@github.com:bloomscorp/react-imagine.git
   git push -u origin main
   ```

3. Publish the first version by hand. npm only lets you add a trusted publisher to
   a package that already exists:

   ```bash
   npm login
   npm ci && npm run lint && npm test && npm run build && npm run verify:package
   npm publish --access public
   ```

4. On npmjs.com, open the package → **Settings** → **Trusted publisher** →
   **GitHub Actions**, and enter exactly:

   | Field | Value |
   |---|---|
   | Organization or user | `bloomscorp` |
   | Repository | `react-imagine` |
   | Workflow filename | `release.yml` |
   | Environment | (empty) |

   Then, under **Publishing access**, choose "Require two-factor authentication and
   disallow tokens".

5. Tag the version you published by hand:

   ```bash
   git tag -a v0.1.0 -m "Release 0.1.0"
   git push origin v0.1.0
   ```

   The workflow sees `0.1.0` is already on npm, skips the publish and creates the
   GitHub release.

## Every release after that

From `main`, up to date, with a clean working tree:

```bash
npm version 0.2.0 --no-git-tag-version     # or 0.2.0-rc.1 for a prerelease
# write the CHANGELOG.md entry
npm ci && npm run lint && npm test && npm run build && npm run verify:package
git commit -am "chore: release v0.2.0"
git tag -a v0.2.0 -m "Release 0.2.0"
git push origin main && git push origin v0.2.0
```

### When the core gets a new minor

`^0.1.0` means `>=0.1.0 <0.2.0`. When the core moves to `0.2.0`, widen the peer range
here (`"^0.1.0 || ^0.2.0"`, or `^0.2.0` if the old one no longer works), update the
dev dependency, and release this package. A core patch needs nothing here.

## If something goes wrong

**E404 at the upload, after provenance was signed.** The trusted publisher does not
match: the organization, repository or workflow filename differ. npm does not allow
editing it; delete the entry, create it again, then **Re-run failed jobs**.

**EOTP.** npm did not see a trusted publish. Same cause, or npm older than 11.5.1.

**The workflow failed before publishing.** Nothing is public. Fix, commit, move the tag:

```bash
git push origin :refs/tags/vX.Y.Z && git tag -d vX.Y.Z
git tag -a vX.Y.Z -m "Release X.Y.Z" && git push origin main && git push origin vX.Y.Z
```

**A wrong version was published.** npm versions are immutable. Release the next patch.
