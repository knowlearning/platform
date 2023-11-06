# Recommended Application Scaffold

## Goal

The goal of this scaffold isn't to prescribe exactly how to structure an app.
The goal is to recommend a structure that works well when we consider applications that are meant to be embeddable in other applications.
Many apps won't need all the flexibility that this scaffold allows, such apps are better served by simpler or more application specific main scripts.

This structure should work well with any front-end web application framework.

## 3 Answers Required for Initialization

Lets talk about 3 questions an app needs to answer before initialization:

### What user is running our app?

This one is pretty easy to answer since ```@knowlearning/agents``` handles authentication for you:
```js
  const { auth: { user, provider } } = await Agent.environment()
```
Now ```user``` will be the UUID that uniquely identifies your user (no matter who the provider is),
and ```provider``` will be the single-sign-on provider the user logged in with.

!!! warning

    ```provider``` may be ```"anonymous"```, in which case you probably want to show a login page.

### What content should the user see?

The answer hinges on whether or not the current URL has a uuid as its resource path.

1.  We recommend that your app first checks if the path is a UUID.
    If it is a UUID, we recommend inspecting its metadata and use its type to decide what content show.
    We recommend this because it helps other apps that want to embed your content
    (such apps include sequence wrappers and recommendation systems that make your content even more useful to everyone).
2.  If the path is not a UUID, then your app can make the decision to show whatever component or content as it normally would
    (using a router for your framework, or whatever implementation you like best).
    Other apps can still embed your content, but they will now need to rely on exact URLs to reference your content.
    Embedding this way isn't so desireable since you will probably want to update the structure of your resource paths some day.
    It is also easier to discover and share content via UUID
    (Of course this is debatable; UUIDs are not the most beautiful looking things, and they are pretty hard to for humans to distinguish.
    But they are really easy for computers to recognize and make use of!
    If content is shared via UUID, then it becomes a lot easier to use the power tools Know Learning provides to explore connected data).

### How do we attach users to their previous application state?

Just use:
```js
  const application_state = await Agent.state()
```
This will attach a user to the same state whenever they encounter your content at the same domain, or embedded in the same way.

## The Scaffold

Once the above questions are answered, an app has everything it needs to initialize.
The recommended scaffold implementation we will dive into now will explicitly show how to answer these questions in code:

```js
import { browserAgent } from '@knowlearning/agents'
import { v4 as uuid, validate as isUUID } from 'uuid'

/*
  We recommend making Agent global so all scripts in your
  project can simply reference it. If you don't want to use a
  global variable, can import browserAgent in any script.
  Calling browserAgent() always returns the same agent.
*/
window.Agent = browserAgent()

const { auth: { user, provider } } = await Agent.environment()

if (provider === 'anonymous') { /* render login page */ }
else {
  const url = new URL(window.location.href)
  const { pathname } = url

  // pathname is always prefixed with '/', so here we remove it
  const potentialUUID = pathname.slice(1)

  if (isUUID(potentialUUID)) {
    const [ metadata, content, state ] = await Promise.all([
      Agent.metadata(potentialUUID),
      Agent.state(potentialUUID),
      Agent.state() // See note below
    ])

    /*
      Use the "content" object to initialize your application as desired.
      Use "metadata" if it is useful for determining how to render your content.
      Use the "state" object as the main state of your application.
      If you want to use multiple Agent.state() scopes to render your content,
      we recommend that you store their uuids somewhere inside of this "state" object
    */
  }
  else {
    const appState = await Agent.state() // See note below
    /*
      Use your preffered framework to initialize content for
      your site using a component, router, plain javascript
      or any other tools you want.
    */
  }
}
```

!!! note

    Calling ```await Agent.state()``` (without any arguments) returns the exact same state as the last time the user called ```Agent.state()``` from the same url, inside the same embedded content.
    If your application is not embedded, and just on your site in a user's browser, the situation is pretty simple:
    The user is always given the same run-state.
    If your application is embedded inside another, your content embedded in that application will be given a state unique to that embedding.

