# Browser security and imports

The build generates a single response-header policy in `dist/_headers`. The
development server reads that file. HTML pages also receive a CSP meta tag before
their resources and a referrer policy. Generated output is not committed.

Scripts load only from the site itself; eval and inline event handlers are not
allowed. Connections are limited to the site and the configured Supabase origin.
Fonts stay local. Data/blob images and blob media support the renderer and exports.
Inline styles remain allowed because existing layouts and animation use them;
this does not allow inline scripts. Camera, microphone, location, payment and USB
access are disabled. Synthetic scene audio uses Web Audio, not microphone capture.

## Production deployment

`_headers` is a convention supported by some static hosts, not a browser feature.
Do not assume uploading it configures the current managed static host. For a host
that does not consume it, set the six response headers from the built file in the
host's response-header configuration or the domain's edge rules. Apply them to
all paths, including the legal pages and assets. The CSP backend origin must match
the configuration used to build the app. A different hosting origin must be checked
separately; a domain rule alone will not protect that origin.

The HTML fallback cannot set `frame-ancestors`, X-Frame-Options, HSTS, nosniff or
Permissions-Policy. Clickjacking protection therefore requires HTTP headers.
HSTS is intentionally omitted on the loopback HTTP development server. Its HTTPS
policy does not include subdomains or preload.

After configuring the host, verify the actual responses:

```sh
npm run build
npm run check:headers -- https://oddtongue.com/
```

The check exits nonzero for redirects, missing headers or differences from the
built policy. Run it against each public hosting origin too. Do not mark the
production header rollout complete until these checks pass. Smoke-test Google
and email sign-in, cloud saves, online generation, scene preview and video export.
This change does not add CAPTCHA or change authentication rate limits.

## Import checks

Language JSON, scene JSON and dictionary CSV are untrusted data. File pickers
check size before reading. Validators bound document size, nesting, node counts,
field lengths and collection sizes; JSON trees reject prototype-related keys.
Language and CSV limits now use UTF-8 bytes, matching files and cloud documents.
Imported names, notes, words and dialogue must render as text, not markup. A CSP
is a second layer of protection; escaping still matters when the host has no CSP.

`tests/import-security.test.mjs` covers byte limits, nested unsafe keys, deep trees,
unchanged inputs and text escaping. Existing tests cover CSV formula protection,
invalid scene structures, duplicate IDs and file round trips.

Before release, use a separate browser origin with no valuable local saves to
import a valid language and scene containing `<img src=x onerror=alert(1)>` and
`<svg onload=alert(1)>` in text fields. Inspect the dictionary, title, scene line
editor, captions and printable reference: no injected element or execution should
appear. Import malformed JSON, unsafe nested keys and files over 1 MB; the current
workspace must remain intact. Import valid Unicode files afterward, then export
and reopen them. Exercise CSV preview with markup and invalid rows; errors must
prevent partial imports. Do not upload these fixtures to real users' cloud saves.
