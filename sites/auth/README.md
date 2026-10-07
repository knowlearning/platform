# Auth redirect storage fallback

Every request stores `{ origin, provider }` in the auth site's localStorage under
the app's original state value, when storage permits. A present
`document.referrer` remains authoritative. If it is empty, only iOS/iPadOS
browsers or macOS Safari may use the SDK's existing encoded return URL from
`/PROVIDER/STATE/ENCODED_RETURN_URL`. This fallback requires an absolute HTTP(S)
URL without credentials and uses only its origin, dropping the path, query,
and fragment. The resolved value also supplies custom providers' `origin`
parameter. Missing or invalid return URLs report an error; other browsers still
require a referrer. URL validation checks format, not destination authorization.

Every outgoing OAuth `state` contains
`KLAUTH1` followed by hexadecimal UTF-8 JSON with the original `state`,
`provider`, and app `origin`. This keeps the value alphanumeric, as required by
[LINE Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/).
The uppercase prefix distinguishes fallback state from the SDK's lowercase
random state. Only the origin is included, without the referrer's path or
query. The callback decodes the original state, reads the stored record under
that key, and prefers its origin and provider over the encoded metadata. It
returns the original state to the app using the existing `/auth/STATE/TOKEN`
format. Only validated transaction records are removed, and cleanup is
best-effort; a cleanup failure does not discard valid stored metadata.

If the stored record is missing, unreadable, or invalid, the callback uses
encoded metadata only on iOS/iPadOS browsers or macOS Safari. This covers auth
storage disappearing between the outbound request and the provider callback.
The same browser gate applies when saving or reading back the record fails
before leaving for the provider; other browsers report the error instead.

Browser identification is a heuristic, not a test that ITP is enabled: iPhone,
iPad, or iPod user agents qualify; Mac-like user agents/platforms with more than
one touch point cover desktop-mode iPads. Desktop Safari requires Mac identity
and both `Version/` and `Safari/` tokens, excluding known competing browser
tokens. Unknown browsers fail closed when storage cannot supply a transaction.

Recovery intentionally omits the auth site's stored-transaction check. The
encoded metadata is unsigned and browser identity is spoofable; neither is a
security boundary. The initiating app's existing state check and the token's
domain binding still apply. This does not recover a lost state nonce on the
initiating app's own origin. Legacy callbacks containing only a raw state nonce
remain supported when their stored record exists, but cannot recover if it is
lost.

The current SDK generates app state as `auth-` followed by 32 lowercase hex
digits from 16 cryptographically random bytes. The app checks this exact format
before looking up its stored return URL, so unrelated keys such as `sid` cannot
validate a callback. The auth site passes the original state through unchanged.
If the SDK updates during a login started with the old unprefixed state format,
that login must be restarted.

## Error reports

Fatal auth errors, OAuth error callbacks, and uncaught page errors display a
centered error message. Only the first error loads `/agents.js`, a separate
bundle built from the current agents source. Successful redirects and recovered
storage failures do not load the agents package.

The reporter creates a JSON state with `type: 'auth-error'`, the error name,
message and stack, an ISO timestamp, provider, auth stage, and a `browser` object.
Browser diagnostics contain `userAgent`, `vendor`, `platform`, `language`,
`maxTouchPoints`, `cookieEnabled`, and `onLine` from `navigator`. Missing or
unreadable fields are `null` and do not prevent reporting. If browser collection
fails altogether, the original error is still reported with `browser: null`.
These browser-reported
values are diagnostic hints, not proof that storage or network requests work.
It redacts callback values and URLs from all diagnostic strings, including
browser fields, and does not include authorization codes,
tokens, raw OAuth state, or provider error descriptions as report fields. Reports
are created in the auth site's domain without consuming a stored login token;
existing cookie/session identity still applies.

After the API acknowledges the state write, the page displays `Error: UUID`.
Loading and saving share a ten-second timeout; failures display
`Error: report unavailable`. The agents package guards localStorage access and
retains the API session ID in memory when storage is unavailable, allowing
reports to be saved without persistent browser storage. Reporting uses an
explicit API host to avoid the SDK's initial session reload and
disconnects once finished. For local testing, the `API_HOST` localStorage value
overrides the production API host.

`npm run build` emits both the inline auth page and the lazy agents bundle.
The import uses a variable URL so Vite leaves it pointing at the bundled entry
instead of copying the unbundled module as a static asset.
