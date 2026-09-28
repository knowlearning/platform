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
