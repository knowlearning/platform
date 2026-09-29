# Auth redirect storage fallback

The normal flow stores `{ origin: document.referrer, provider }` in the auth
site's localStorage under the app's original state value. That original value
remains the OAuth `state`, and the callback reads and removes the stored record.

If saving or reading back that record fails, the OAuth `state` instead contains
`KLAUTH1` followed by hexadecimal UTF-8 JSON with the original `state`,
`provider`, and app `origin`. This keeps the value alphanumeric, as required by
[LINE Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/).
The uppercase prefix distinguishes fallback state from the SDK's lowercase
random state. Only the origin is included, without the referrer's path or
query. The callback decodes this fallback without accessing storage and returns
the original state to the app using the existing `/auth/STATE/TOKEN` format.

This fallback intentionally omits the auth site's stored-transaction check.
Its metadata is unsigned; the initiating app's existing state check and the
token's domain binding still apply. Fallback callbacks are accepted even if
storage becomes available again before the provider returns.

The fallback must be selected before leaving for the provider. If a normal
transaction is lost or becomes unreadable later, its callback still fails:
the original OAuth state contains no routing information to recover.

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
