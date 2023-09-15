# States

Once an application has a user, it probably wants to show them some information and let them save some information. That's where state comes in. The Know Learning API lets you easily save, retrieve, and update state in JSON objects. All state that is created is addressable by a "universally unique id" (uuid).

## Fetch

Lets say that someone has told you about a special uuid and you want to see what its all about.

```javascript
const super_special_uuid = '49b2c79b-f051-4be8-81c5-d67c557cbab7'
const state = await Agent.state(super_special_uuid)
```

State will be a JSON object with whatever the owner of that super_special_uuid has saved there.

## Watch

Okay, so now you know how to get the current state for any uuid you might find in the wild. What if you want to know about changes that the owner of that state is making? Our API can help with that situation too:

```javascript
function updateHandler(update) {
  //  This function will be called any time the data at
  //  super_special_uuid is modified. The update parameter will
  //  contain the new state, as well as some other useful info.
  console.log(update)
}

Agent.watch(super_special_uuid, updateHandler)
```

Now, whenever the owner of ```super_special_uuid``` makes changes, the function called updateHandler will be called.


## Create

If you want to create new some state yourself, simply generate a completely new uuid, and request some state for it:

```javascript
const favorite_number_id = Agent.uuid()
const my_new_state = await Agent.state(favorite_number_id)

my_new_state.my_favorite_number = 42
```

Congratulations!
If you do that, you are now the proud new owner of the state at that id!
Also, never in the history of the world will ```Agent.uuid()``` generate the same id again.

## Update

If you want to change some state you own, you can simply fetch it then update it like so:

```javascript
my_new_state.my_favorite_number = 42
```

Editing state like this will notify anyone who is watching the state, and persist your changes for the next request.

!!! question annotation "Who can update a state?"

    The user who creates a state is also the only person who is ever able to update a state. We refer to the creator of a state as the "owner."
    You can find the owner of any state in that state's metadata.

## Metadata

We've been talking a lot about "owners" of states. How can we know who owns a state? That's a question for metadata. We can get a state's metadata like this:

```javascript
const metadata = await Agent.metadata(some_special_scope)
```

The metadata object returned will contain the user id of the owner, and some other interesting fields.

## Names

Names are pretty useful things;
they're so useful you probably even have one yourself.
You can give your states names too.
To get a new named state, simply create it like this:

```javascript
const my_new_named_state = await Agent.state('sparky')
const metadata = await Agent.metadata('sparky')

console.log(metadata.name) // -> 'sparky'
console.log(metadata.id) // -> a newly generated uuid
```

You can use the generated uuid or the name in the future.
You can also change the name of a scope any time.

```javascript
const metadata = await Agent.metadata('sparky')
metadata.name = 'good boy'
```

If you do that, you can no longer fetch the original state with ```Agent.state("sparky")```, you have to use ```Agent.state("good boy")```.

!!! info

    When you call ```Agent.state(name)```, the API fetches your most recently updated state with that ```name```.
