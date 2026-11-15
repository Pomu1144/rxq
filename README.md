# rxq: iPhone build of Ninja Legends

GitHub Actions builds [NXBNVNB](https://github.com/Pomu1144/NXBNVNB)'s Capacitor app into an unsigned `.ipa`.

- **Start a build:** push to `main`, or Actions → *Build iOS IPA (unsigned)* → *Run workflow* (pick a NXBNVNB branch if needed).
- **Live app (about 300 MB with the sprites inside; pages and art come from the website and update themselves; needs internet):** https://github.com/Pomu1144/rxq/releases/latest/download/NinjaLegends-live.ipa
- **Lite app (a few MB; everything, sprites included, comes from the website):** https://github.com/Pomu1144/rxq/releases/latest/download/NinjaLegends-lite.ipa
- **Full offline app (about 1.5 GB):** https://github.com/Pomu1144/rxq/releases/latest/download/NinjaLegends-unsigned.ipa
- **Install:** sign and install it with your sideloading tool (Apple ID signing).

## Changes rxq adds to the app (`patch/`)

- `css/teams-compact.css`: phone (landscape) layout of the Team Formation page: one screen, round team pills,
  row labels on the side, roster with 4 columns. Added to every build until NXBNVNB has the same file
  (`css/teams-compact.css`, linked in `teams.html` after `css/ink/teams.css`); once it does, the app's copy steps aside.
- `js/sprites-local.js`: live build only, loads sprites from the app's own copy.
- `js/diag.js`: debug build only, a small on-screen log of page loads.

## Blazing art pack (sprites from your Blazing IPA)

`tools/blazing_pack.py BLAZING.ipa OUT` pulls the art out of a Naruto Blazing IPA (every texture, the UI atlases cut
into named sprites with their 9-slice borders, character rigs) into a folder with a `manifest.json`. The build puts
it in the app at `assets/blazing/` and the game reads it with `window.BlazingAssets` (`patch/js/blazing-assets.js`,
in every build) and plays rigs with `window.SSPlayer`. The pack is on the `blazing-pack` branch (`blazing-pack.zip`), kept
out of main; the repository variable `BLAZING_PACK_URL` (and secret `BLAZING_PACK_TOKEN`) can point the build at
another copy.
