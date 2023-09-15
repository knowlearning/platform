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

## state(id: string) &rarr; Promise&lt;Object|Array&gt;
The ```id``` argument can be a string containing one of the following:

* A UUID that uniquely identifies the requested state.
* The name of the state to access.
* The name of a special "Query backed scope" to fetch.

If this method is called with a new UUID, the calling user will become the owner of that state.

If this method is called with a name, the Know Learning API will either find and return the last state the user updated with that name, or create a new state for the user and give it the supplied name.


## metadata(id: string) &rarr; Promise&lt;Object&gt;
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

## watch(id: string, callback: function)

The callback function will be called whenever an update is applied to the state for ```id```.

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
