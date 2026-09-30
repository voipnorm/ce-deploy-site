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

## Publishing a blog post

Add a Markdown file to `src/content/blog/`; its filename becomes `/blog/<filename>/`. Frontmatter fields: `title`, `description`, `date` (quoted YYYY-MM-DD), `author`, `tags` (list), optional `discussion` URL, and `draft`. Use `draft: true` for unpublished writing: it is excluded from routes, search, and RSS. Set it to false only when approved. Put approved public images in `public/blog/` and use `/blog/<image>` in Markdown. The original working draft remains in `docs/drafts/` outside the public build.

Posts sort newest first. Reading time, heading navigation, related posts, tags, search, and `/blog/rss.xml` derive from the Markdown. Historical version references in dated blog articles are exempt from the current-release constant rule. Use the site’s download page when linking to the current release.

For engagement, create an Announcements discussion in the site repository and put its URL in `discussion`. Readers react or comment on GitHub; no embedded tracker, browser token, or comment database is needed. The telephone-box background is an original generated image made for this site, not the old Blogger stock photograph.
