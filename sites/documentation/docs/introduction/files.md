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
