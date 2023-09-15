# Welcome to the Know Learning API

The goal of this API is to give developers a small set of simple tools that can compose elegantly into stateful backbones for complex applications.
Regardless of the desired attibutes of an application, be they real-time, data intensive, collaborative, or others, developers should not need to make impactful and inevitably restrictive decisions up front.

The Know Learning API is designed to smoothly transition projects from safe and playful sandboxes to high quality, globally deployed applications.

## The Agent

We use the term "Agent" to describe any system connected to our API.
It could be a browser based application, a server, an IOT device, or anything else that has an internet connection to our infrastructure.
All communication with our infrastructure runs through this "Agent" connection.

## API Summary

Rather than just say we have a small set of useful tools, we'll show them. Here's a quick summary of our API:

```js
import { browserAgent } from '@knowlearning/agents'

//  Create an agent to use
const Agent = browserAgent()

//  Generate a uuid so we can associate some data with it
const id = Agent.uuid()

//  The current state of the data at id
const state = await Agent.state(id)

//  Useful metadata related to that id
const metadata = await Agent.metadata(id)

//  How to watch for updates
function watchCallback(update) {
  //  This function will be called any time the owner of the
  //  state held at id updates it.
}
Agent.watch(id, watchCallback)

//  Prompt a user to upload a file from their computer
const uploadId = await Agent.upload()

//  Download the uploaded file back to the user's computer
await Agent.download(uploadId)
```