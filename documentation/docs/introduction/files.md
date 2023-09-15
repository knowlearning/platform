# Files

## Uploads

If you need to upload a file, you can upload it through the agent:

```js
const name = "My newest upload"
const type = "application/json"
const data = JSON.stringify({ data: 'for later' })
const id = Agent.uuid()

await Agent.upload({ name, type, id }, data)
```

To prompt the user to select a file to upload:

```js
const id = Agent.uuid()
await Agent.upload({ id })
```

!!! tip

    Whenever you upload, ```id``` is optional.
    The resolved value of ```await Agent.upload()``` or ```await Agent.upload({ name, type })``` will be the id of the upload.

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
