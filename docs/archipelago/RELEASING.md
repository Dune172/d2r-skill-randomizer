# Releasing the Archipelago world and client

The apworld and the client are released together, from one build, because they share id
tables and a slot contract and a mismatched pair is refused when the client connects.

## Before a release

1. The in-game gates in [PLAYTEST.md](PLAYTEST.md) have been run for everything the
   release describes as working. Anything unconfirmed stays marked EXPERIMENTAL and off
   by default.
2. Versions agree. `world_version` in `apworld/d2rr/archipelago.json` and
   `AP_WORLD_VERSION` in `src/lib/archipelago/options.ts` are the same, and
   `scripts/verify-ap-options.mjs` passes.
3. Contracts were bumped if they changed: `SLOT_CONTRACT_VERSION` (apworld) with
   `SlotContractVersion` (client) when slot_data changed, and `AP_CONTRACT_VERSION`
   (site) with `manifest.ContractVersion` (client) when the mod manifest changed.
4. The site with the matching `/api/archipelago/mod` is deployed. The client's default
   server is d2rrandomizer.com, so a client released ahead of the site cannot fetch a mod.
   The reverse holds too: once the site's `AP_CONTRACT_VERSION` moves, it answers 409 to
   every client released before, so deploy the site and publish the matching client
   together.
5. Locally:

   ```bash
   npm run ap:test
   node scripts/dev-cold-cache.mjs          # in another terminal
   node scripts/verify-ap-mode.mjs
   node scripts/build-apworld.mjs --install
   node scripts/verify-apworld-fill.mjs
   node scripts/verify-ap-room.mjs
   ```

## The app on the page

`/archipelago` serves `public/archipelago/d2rr-ap.exe`, which is committed. Rebuild it
whenever the client changes, and commit it with the change:

```bash
node scripts/publish-ap-client.mjs
```

It stamps the build with the commit (`d2rr-ap.exe version`), and CI fails if the
committed app speaks a different contract from the source. Deploying the site then ships
it; no tag is needed for testers.

## Cutting it

Push a tag named `archipelago-v` plus the world version:

```bash
git tag archipelago-v0.1.0
git push origin archipelago-v0.1.0
```

The `Archipelago` workflow tests the world on Python 3.11 to 3.13 inside a checkout of
Archipelago, tests and builds the client on Windows, checks that the world, the client
and the page agree, and then publishes a GitHub release with `d2rr.apworld`,
`d2rr-ap.exe`, `D2R Randomizer.yaml` and `SHA256SUMS.txt`. The release text is
[RELEASE_NOTES.md](RELEASE_NOTES.md); edit it in the same commit as the version.

It is published as a pre-release. Untick that on GitHub once the gates have passed.

## After

- Link the release from `/archipelago` (the client download line in
  `src/app/archipelago/page.tsx`), then list the page in `SiteNav.tsx` and `sitemap.ts`
  and remove its `noindex` and the `robots.ts` entry.
- Ids are frozen from the first public release: add items, locations and areas at the
  end of their tables, never renumber.
