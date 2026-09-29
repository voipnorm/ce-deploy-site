# CE-Deploy Site

The product website for [CE-Deploy](https://github.com/voipnorm/CE-Deploy), built with Astro and deployed through GitHub Pages.

## Local development

```sh
npm install
npm run dev
```

## Production build

```sh
npm run build
```

The site is configured for `https://ce-deploy.voipnorm.com/`.

## Updating the current release

Change `CE_DEPLOY_VERSION` in `src/config/release.mjs`, then build and publish. Current-version labels and release links across downloads, membership, the home page, documentation, training, and What's New derive from this module. No network request is needed during the build.

Dated What's New entries are historical records: add release highlights separately and retain their original versions and links. Membership entitlements are not inferred from a version number. The site's package.json version is the website package version, not the CE-Deploy application version.

Run `npm test` and `npm run build` before publishing. The release-reference test rejects hardcoded application versions and independent latest-release URLs outside the historical release notes.
