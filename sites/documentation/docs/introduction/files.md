# Files

## Uploads

If you need to upload a file, you can upload it through the agent:

```js
const name = "My newest upload"
const type = "application/json"
const data = JSON.stringify({ data: 'for later' })
const id = Agent.uuid()

await Agent.upload({ name, type, id, data })
```

To prompt the user to select a file to upload using the browser's file picker:

```js
const id = Agent.uuid()
const validate = async function (file) {
  // validate is an optional parameter. If supplied, it must
  // resolve to true, otherwise the upload will be aborted.

  return true
}

await Agent.upload({ id, browser: true, validate })
```

The "file" parameter for the validate function is an instance of the web standard [File](https://developer.mozilla.org/en-US/docs/Web/API/File).

!!! tip

    Whenever you upload, ```id``` is optional.
    The value of ```await Agent.upload({ browser: true })``` or ```await Agent.upload({ data: 'Some text data to upload' })``` will be the id of the upload.

### Reconnecting during an upload

Each `Agent.upload()` call creates a separate upload request, even when you supply
the same file `id`. Replaying an initialized request after reconnecting renews its
upload URL for the same storage object without changing the file's metadata.
This allows a pending caller to continue after losing the original URL response.
Generating a renewed URL does not transfer the file's bytes or confirm a completed
upload.

Renewal confirms the existing Redis allocation only; it does not retry failed
SQL synchronization or reconstruct missing history. A delivered upload error
remains an error; only a still-pending request can resume from a renewed URL.

A new `Agent.upload({ id, ... })` call is still a replacement upload. If a newer
request has replaced the mapping, an older replay is rejected rather than moving
the mapping backward. Incomplete requests and requests initialized by older
servers with random storage object IDs are also rejected on replay. Existing
files remain downloadable; this change does not repair previously broken mappings.
Deploy the replay protection to every API server: an older server can still
replace a mapping when it processes a repeated request.

The mapping is established before the caller's storage PUT succeeds. A new
replacement upload that is abandoned or fails can therefore still leave the file
unavailable. Retrying an upload URL can replace the contents of its storage object;
URLs are not write-once capabilities.

The server's `upload-v1` object identity is UUIDv5 with the URL namespace over
the JSON array `["upload-v1", domain, user, requestId, fileId, contentType,
signingType ?? null]`. The authenticated identity, resolved request UUID, field
order, and MIME policy are a compatibility contract for reconnecting clients.
Changes to that derivation must preserve renewal of existing allocations or
explicitly reject them without modifying their mappings. Request revisions are
assumed to be reliable: revision 1 may initialize the mapping; later revisions
may only renew a matching allocation's URL.

## Downloads

If you know the id of a file, downloading it is trivial:

```js
const response = await Agent.download(id)
const textValue = await response.text()
```

The ```response``` object is a [standard fetch response](https://developer.mozilla.org/en-US/docs/Web/API/Response).

If you want to download a file directly to a user's computer:

```js
await Agent.download(id).direct()
```

If you just want a string of a URL that you can use to download the file, or to add as an image's "src" attribute, or reference in some other way:

```js
const downloadUrl = await Agent.download(id).url()
```
