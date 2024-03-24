# Historical Data

Downloads aren't just for files that we directly uploaded.
We can download the whole history of states we have access to:

```js
// create a new data state and write to it
const id = Agent.uuid()
const state = await Agent.state(id)
state.my_favorite_number = 42

// view the history of interactions with that state
const response = await Agent.download(id)
const updates = await response.text()
```

The ```updates``` variable above will contain the following string value:

```
1690058397758 [{ "op": "add", "path": ["my_favorite_number"], "value": 42 }]
```

Whenever the state is modified, new lines are added to the downloadable file.
Each line has a timestamp followed by a JSON array that specifies the changes made to the state.
We use a format very similar to [JSONPatch](https://jsonpatch.com/), but with an improved format for the ```"path"``` value.
