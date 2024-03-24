# Agent Reference

The following are methods on the agent object.

## login(provider: string)

Will redirect a user to log in through the specified login provider.

Valid login provider values are:

* ```"google"```
* ```"microsoft"```

After a user authenticates with the provider, they will be redirected back to your application.

## logout()

Immediately removes all authentication credentials and reloads the application.

## uuid() &rarr; String

Returned string is a new [UUID](https://developer.mozilla.org/en-US/docs/Glossary/UUID).

## state(id: string, user: OPTIONAL string) &rarr; Promise&lt;Object&gt;
The ```id``` argument can be a string containing one of the following:

* A UUID that uniquely identifies the requested state.
* The name of the state to access.
* The name of a special "Query backed scope" to fetch.

If this method is called with a new UUID, the calling user will become the owner of that state.

If this method is called with a name, the Know Learning API will either find and return the last state the user updated with that name, or create a new state for the user and give it the supplied name.

You can supply the optional ```user``` parameter, if you want to watch another user's named state.

!!! note

    There is no need to supply the ```user``` parameter if you are using a uuid reference,
    since the system will already know what user owns the uuid in question.

## metadata(id: string, user: OPTIONAL string) &rarr; Promise&lt;Object&gt;
The ```id``` argument can be a string containing one of the following:

* A UUID that uniquely identifies the requested state.
* The name of the state to access.

Here is an example metadata object:

```js
{
  ii: 0,
  active_type: 'application/json',
  owner: '30cff459-992c-496a-af3a-bcf2761cab95',
  domain: 'example.com',
  name: null,
  created: 1690062046150,
  updated: 1690062046150,
  active_size: 128,
  storage_size: 256
}
```

The ```ii``` field is the counter for how many updates have been made to the state. It stands for "interaction index."

## watch(id: string, callback: function, user: OPTIONAL string)

The callback function will be called whenever an update is applied to the state for ```id```.
If you want to set up a watcher for a user's named scope, supply the name for ```id```.
If you want a user to watch another user's named scope, set the other user's id as ```user```.

Here is an example update object:

```js
{
  // summary of changes
  patch: [
    {
      op: 'add',
      path: ['favoriteNumber'],
      value: 42
    }
  ],
  // current state after changes
  state: {
    favoriteNumber: 42
  }
}
```

The ```patch``` field is ```null``` in the first update object,
and ```state``` represents the current state of the scipe at the time of the call.

## upload(info OPTIONAL) &rarr; Promise&lt;String&gt;

The ```info``` parameter has the form:

```
{
  name: name for the uploaded data
  type: a MIME type like "text/plain" or "img/png"
  data: can be a String or ArrayBuffer
  id: UUID you want to use,
  browser:
    If in the browser environment you can set this to true
    to automatically prompt the user to select a file through
    the browser's built-in file selection interface.
  accept:
    If in the browser environment, this parameter will filter
    available files in the file picker by type according to the
    provided [type specifier](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept).
}
```

This will upload an immutable blob containing the value in ```data``` and return a promise for the id of the blob.
You can force the ```id``` parameter with your own value, but it must be a new uuid, otherwise an error will be thrown.

All fields in the ```info``` parameter are optional.
If you supply no fields or no ```info``` parameter,
an upload url will be returned that can be used to PUT data to.

## download(id: string) &rarr; Promise&lt;Fetch Response&gt;

This will download an uploaded blob.
You also have the option do directly download the blob to a user's browser:

```js
const response = Agent.download(id)

//  You can do what you want with the fetch response:
response.then(async fetchResponse => console.log("Here's the data!", await fetchResponse.text()))

//  Doing the following will trigger a download directly to the user's computer
response.direct()

```
