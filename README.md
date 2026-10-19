# Unknown Canvas

**One endless canvas. Everyone draws. Nobody signs it.**

A dependency-free anonymous collaborative drawing site, designed for GitHub Pages. No account, usernames, profiles, or chat. Just marks left by strangers.

## Use

- Draw with mouse, stylus, or one finger.
- Choose a color and brush size.
- Hand tool / hold Space to pan. Wheel or two-finger pinch to zoom.
- B: brush. H: hand. 0: origin.
- Wander discovers a randomly chosen mark among the latest 1,000 strokes.
- Share spot copies a coordinate link. Save view downloads a PNG.

Strokes persist in Supabase and refresh every 2.5 seconds. Failed uploads are retained in a local outbox and retried. Artists have no public identity. Infrastructure providers can still retain normal technical logs.

## Publish on GitHub Pages

Upload these files to the root of a repository. In Settings → Pages, choose Deploy from a branch, `main`, `/ (root)`.

`config.js` contains a browser-safe publishable API key, not a secret key. The deployed database grants visitors SELECT and INSERT only. Nobody can erase or modify existing strokes using this public key. The owner can moderate through the Supabase dashboard.

## Backend

The shared backend is already configured in `config.js`. `schema.sql` documents its setup for a separate Supabase project. If forking for your own independent canvas, create your own backend and change `config.js`; otherwise forks share the same artwork.

No third-party script or package dependency. Requires a modern browser and HTTPS (GitHub Pages provides HTTPS).

## Practical limits

Coordinates range from −1 billion to +1 billion. This feels infinite but is not mathematically infinite. The visible region loads at most 10,000 strokes; zooming in resolves dense areas. It is an experimental small-community canvas: it does not include server-side per-visitor rate limiting or automated moderation. Public launch at large scale needs these protections and a spatial tile renderer. Provider quotas still apply.

## Owner moderation

Use the SQL editor to inspect the `unknown_canvas_strokes` table and remove offending stroke IDs. Visitors cannot issue deletes. No IP address, account identifier, or device identifier is stored in the drawing table.

## License

Code: MIT. User artwork remains its creators' work; uploading a drawing makes it publicly visible and downloadable.
