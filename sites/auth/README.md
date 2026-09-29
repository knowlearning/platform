# Auth redirect storage fallback

Every request stores `{ origin: document.referrer, provider }` in the auth
site's localStorage under the app's original state value, when storage permits.

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

## Error reports

Fatal auth errors, OAuth error callbacks, and uncaught page errors display a
centered error message. Only the first error loads `/agents.js`, a separate
bundle built from the current agents source. Successful redirects and recovered
storage failures do not load the agents package.

The reporter creates a JSON state with `type: 'auth-error'`, the error name,
message and stack, an ISO timestamp, provider, and auth stage. It redacts callback
values and URLs from diagnostics, and does not include authorization codes,
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
