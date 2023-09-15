# Recommended Application Scaffold

## Goal

The goal of this scaffold isn't to prescribe exactly how you should structure an app. Many apps won't need all the flexibility that this scaffold allows for, so they'll probably be better served by much simpler main scripts.

The goal of this scaffold is to demonstrate, as simply as possible, a fully fleshed out structure with clear places to make top-level application architecture decisions. This structure should work well with any front-end web application framework.

## 3 Answers Required for Initialization

Lets talk about 3 questions an app needs to answer before initialization:

1.  What user is running our app? ```@knowlearning/agents``` handles authentication for you:
    ```js
       const { auth: { user, provider } } = await Agent.environment()
    ```
    Now ```user``` will be the UUID that uniquely identifies your user (no matter who the provider is), and ```provider``` will be the single-sign-on provider the user logged in with (WARNING! ```provider``` may be ```"anonymous"```, in which case you probably want to show a login page).
2.  What content should the user see? Usually we use 2 pieces of information to decide. Both of those pieces are found in the URL of the app: the domain the user is using, and the "resource path" (all parts after the domain).
    1. We recommend that your app first checks if the path is a UUID. If it is a UUID, we recommend inspecting its metadata, then using its type to decide what kind of content you want to show. We recommend this because it helps other apps that want to embed your content (such apps can include valuable sequence wrappers and recommendation systems for that make your content even more useful to everyone).
    2. If the path is not a UUID, then your app makes the decision to show whatever component or content as it normally would (using a router for your framework, or whatever implementation you like best).

        Other apps can still embed your content, but they will now need to know your domain, and remember the structure of your resource path to be able to reference your content. Embedding this way isn't so desireable since you will probably want to update the structure of your resource paths some day. It is also much easier to discover and share content via UUID (Of course this is debatable; those UUIDs are not the most beautiful looking things, and they are pretty hard to for humans to distinguish. But they are really easy for computers to recognize and make use of! If content is shared via UUID, then it becomes a lot easier to use the power tools Know Learning provides to explore connected data and metadata related to UUIDs).

3. What data do we use as the "props" to initialize the content?
    1. If the path is a UUID, then we recommend you use the data of that UUID to initialize the content.
    2. If the path is not a UUID, then the app decides as it normally would (perhaps using query parameters, hardcoded values, or even requesting specially named scopes for the user).

Once these questions are answered, an app has everything it needs to initialize. The recommended scaffold implementation we will dive into now will explicitly show how to answer these questions. As we're doing so we will discuss the many flexibilities and possible decisions for your unique app.

## The Scaffold

```js
import { browserAgent } from '@knowlearning/agents'
import { v4 as uuid, validate as isUUID } from 'uuid'

/*
  Replace MEANINGFUL_APPLICATION_TYPE with something makes
  sense for your application.

  The scope you give this RUN_STATE_TYPE will be used as the
  main persistent object for your user to write data into.
*/
const RUN_STATE_TYPE = 'application/json;type=MEANINGFUL_APPLICATION_TYPE'

/*
  We recommend making Agent global so all scripts in your
  project can simply reference it. If you don't want to use a
  global variable, can import browserAgent in any script.
  Calling browserAgent() always returns the same agent.
*/
window.Agent = browserAgent()

const { auth: { user, provider } } = await Agent.environment()

if (provider === 'anonymous') {
  // render login page
}
else {
  const url = new URL(window.location.href)
  const { pathname } = url

  // pathname is always prefixed with '/', so here we remove it
  const potentialUUID = pathname.slice(1)

  if (isUUID(potentialUUID)) {
    const [ content, contentMetadata, branches ] = await Promise.all([
      Agent.state(potentialUUID),
      Agent.metadata(potentialUUID),
      Agent.branches(potentialUUID, RUN_STATE_TYPE, user)
    ])

    /*
      Use "contentMetadata.active_type" to determine what
      component/interface to initialize and use content to
      initialize that component/interface with the right
      properties.

      "branches" is an array containing scopes that the given
      user has created with active_type of RUN_STATE_TYPE that
      are "based" on "potentialUUID". If no such scope existed
      before, one will be created for the user. You can use
      whatever application logic you want to choose which scope
      to use. They are sorted by last updated, where the most
      recently updated is first.

      If you would like to create a new branch, use:
      const id = await Agent.branch(potentialUUID, RUN_STATE_TYPE)
    */
  }
  else {
    //  Use your preffered framework to initialize content for
    //  your site using a component, router, plain javascript
    //  or any other tools you want.
  }
}
```
