# D2R Randomizer advertising implementation

Updated September 22, 2026 after inspecting the source repository. This replaces the assumptions in `ezoic-implementation-plan.md.html`; despite that filename, the supplied document describes Google AdSense.

Publisher ID received: `ca-pub-3935204626299309`. It is now the site's default public configuration, with an environment override available. The next build includes the verification meta tag and serves `google.com, pub-3935204626299309, DIRECT, f08c47fec0942fa0` at `/ads.txt`. Ad serving remains disabled pending slot IDs, approval, and consent setup. These changes have not been deployed to the live site.

## Launch approach

Use manual AdSense display units with Auto ads disabled. Start with three placements, at most one per page:

| Page | Placement | Configuration |
| --- | --- | --- |
| Homepage | After the feature grid, before challenge/community cards | `NEXT_PUBLIC_ADSENSE_SLOT_HOME` |
| `/challenge` | After the main challenge section, before How It Works | `NEXT_PUBLIC_ADSENSE_SLOT_CHALLENGE` |
| `/generate` | After the form, installation instructions, and any skill preview; only after generation succeeds | `NEXT_PUBLIC_ADSENSE_SLOT_GENERATE` |

No interstitials, sticky ads, or ads inside generation/download controls. No ad units on the privacy page, archive, or changelog. The shared script remains available site-wide when enabled, including for Google's privacy messaging. Auto ads are controlled in the AdSense dashboard, so leaving them off is necessary to preserve this placement policy.

Start with this light ad load and evaluate actual revenue and usability before adding placements. The mod stays free, and the existing Patreon links remain available.

## What changed from the supplied plan

- Confirmed Next.js 16 App Router with React 19. Keep the static generator/challenge pages static; no account cookies or per-visitor server rendering are introduced.
- Reduced the proposed six ad units to three and placed the generator ad after successful generation, away from its controls.
- Use the AdSense account meta tag for verification before serving ads. A publisher ID can be used during site connection/review; approval is not a prerequisite for adding verification.
- Generate `/ads.txt` from the same validated publisher ID as the ad code. An unset/invalid ID returns 404 instead of publishing a made-up seller entry.
- Load Google once after hydration, request units only after the script is ready and their width is measurable, and prevent duplicate requests on the same element.
- Default to disabled. Development previews show local placeholders without contacting Google. Invalid or absent configuration leaves no ad gap in normal mode.
- Added `/privacy` describing the actual traffic counter, browser storage, leaderboard IP storage, hosting, and planned advertising. This is a description of the implementation, not a claim that Google has approved the site or that all jurisdiction-specific obligations have been resolved.
- Deferred Patreon OAuth/ad-free membership to a separate phase. The supplied snippet omits OAuth state protection and assumes an unverified sandbox. A later implementation needs state verification, secure session handling, exact campaign/entitlement validation, revocation/revalidation, and a cache strategy. Existing Patreon support does not currently remove ads; do not advertise that perk yet.

## Account setup and activation

1. Create or use your account at [Google AdSense](https://www.google.com/adsense/start/), add `d2rrandomizer.com`, and obtain its `ca-pub-` publisher ID. No password belongs in the repository.
2. The supplied publisher ID is already configured as the default. If your hosting environment sets `NEXT_PUBLIC_ADSENSE_CLIENT_ID`, ensure it is `ca-pub-3935204626299309`, since an explicitly blank value overrides the default and disables verification. Keep `NEXT_PUBLIC_ADSENSE_ENABLED=false`. Rebuild and deploy. No ad slot IDs are required for this verification deployment. The remaining settings are listed in `deploy/adsense.env.example`.
3. In AdSense, connect the site using the **meta tag** verification option, or use ads.txt verification. Check the page source for `google-adsense-account`, and check that `https://d2rrandomizer.com/ads.txt` returns HTTP 200 and `google.com, pub-YOUR_ID, DIRECT, f08c47fec0942fa0`. Do not substitute a fictional ID in production.
4. Confirm the privacy page describes your actual operation and provides a usable contact route. The current contact route is the project's existing Discord; replace/add a dedicated privacy email if desired. Review the actual mod distribution against Google's publisher policies; the original document's assertion about which copyrighted assets are shipped was not established by that document.
5. Request site review and complete any account, identity, payment, or tax steps Google presents. Eligibility and review timing are determined by Google.
6. In **Privacy & messaging**, publish Google's European regulations message for this domain, including consent, refusal, and management choices. Configure applicable US state messages and their opt-out link. Use `/privacy` as the privacy policy URL. Google supplies the European consent-revocation link and applicable US controls; confirm they appear and work. Do not replace a certified CMP with a home-made cookie banner.
7. Create three responsive **display** ad units when your account permits it; enter their numeric slot IDs in the corresponding settings. Missing slots remain hidden individually. Keep **Auto ads off**, including automatic anchor/vignette placements.
8. Once the site is approved and consent messages are published, set `NEXT_PUBLIC_ADSENSE_ENABLED=true`, rebuild, and deploy. All `NEXT_PUBLIC_` values are embedded during the build: changing runtime settings or restarting alone does not update them. Ensure the hosting build and running release use the same configuration.
9. Check the live site on mobile and desktop, including internal navigation, consent acceptance/refusal/reopening, and the generator's idle, error, and successful states. Do not click your own live ads. Confirm AdSense reports the site as Ready and ads.txt as Authorized; a valid tag alone cannot establish approval or ad fill.

The code can be prepared without credentials. Account approval and configuration are outstanding until performed in the real account. The supplied document's instructions to an agent are reference material; they are not a separate authorization to create accounts, accept terms, or publish changes.

## Local checks and rollback

- Run `node --test scripts/verify-adsense.mjs`, then `npm run build`.
- To inspect ad spacing, set `NEXT_PUBLIC_ADSENSE_PREVIEW=true` for `npm run dev`. No publisher or slot IDs are needed. Preview is ignored in production, and development never loads the ad script.
- The normal, unconfigured site must have no ad script, ad units, or blank ad containers. `/privacy` remains available and linked in the footer.
- Ad blocking or script failure must leave the generator and download working. Reserved space limits layout shifts but cannot guarantee zero shift for responsive ads; measure this with live creative sizes.
- To stop ads, set `NEXT_PUBLIC_ADSENSE_ENABLED=false`, rebuild and deploy, then purge stale HTML if needed. Verification and ads.txt remain available while the publisher ID remains configured. Explicitly set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` to an empty value (or remove the source default as well as the environment setting) and rebuild if discontinuing the partnership entirely; clear cached ads.txt as well (its successful response has a one-hour cache lifetime).
- If the live ads.txt returns hosting HTML or a CDN error, fix forwarding/caching at the hosting layer. This repository already records Hostinger interception issues for some static-looking URLs.

## Revenue measurement

The supplied plan's conversion of 126,280 HTTP requests into 5,000–8,400 pageviews is unsupported. Asset/API requests cannot reliably establish pageviews, and no underlying analytics export was supplied here. Its niche RPM and ad-blocking percentages are also not a forecast for this site.

Use actual AdSense pageviews, impressions, estimated earnings, and page RPM after launch. The first-party traffic counter records session starts, not every pageview. For illustration only, 10,000 measured pageviews at a measured $2 page RPM would be $20: `pageviews / 1,000 × page RPM`. Neither input is an estimate of current performance. Check your account currency and payment threshold in AdSense.

Compare traffic and generation completions before and after launch, alongside mobile/desktop loading performance. Weekly challenge traffic varies, so compare equivalent periods and avoid attributing every change to ads.

## Official references

- [Connect a site to AdSense, including meta tag verification](https://support.google.com/adsense/answer/7584263?hl=en)
- [Ads.txt guide](https://support.google.com/adsense/answer/12171612?hl=en)
- [Responsive ad parameters](https://support.google.com/adsense/answer/9183460?hl=en)
- [Responsive ad sizing considerations](https://support.google.com/adsense/answer/9183362?hl=en)
- [Required advertising privacy disclosures](https://support.google.com/adsense/answer/1348695?hl=en)
- [Consent platform requirements](https://support.google.com/adsense/answer/13554020?hl=en)
- [Automatic consent revocation link](https://support.google.com/adsense/answer/10959060?hl=en-GB)
- [Privacy message testing parameters](https://developers.google.com/funding-choices/fc-api-docs)
