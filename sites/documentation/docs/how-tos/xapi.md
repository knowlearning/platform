# xAPI


## Making scopes translatable

You can trigger the creation of an xAPI statement from any scope.
That scope's id will be available whenever querying xAPI statements.

Here's an example piece of data that we might want to create an xAPI statement for.
Imagine it is a user's response to a multiple choice question that they just answered.

```json
{
    "selections": [2, 3]
}
```

If we want to store an xapi statement, then we simply need to update the xapi field inside

```json
{
	"selections": [1, 2],
    "xapi": {
        "verb": {
            "id": "http://adlnet.gov/expapi/verbs/answered"
        },
        "object": ID_OF_MULTIPLE_CHOICE_CONTENT,
        "result": true
    }
}
```

That will trigger the cretion of an xapi statement.