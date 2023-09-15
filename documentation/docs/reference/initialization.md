# Initialization Reference

## Domains

### Register your domain

## Clients

The Know Learning API client is published as the ```@knowlearning/agents``` npm package.

All API operations can be accessed through an "Agent" instance.

### Create an Agent

```js
import { browserAgent } from '@knowlearning/agents'

//  We recommend adding the browser agent as a global variable
window.Agent = browserAgent()
```

If you don't want to set a global variable, you can import and call ```browserAgent``` in any file. Only one Agent will be created, and additional calls to browserAgent will return that Agent.

```js
import { browserAgent } from '@knowlearning/agents'

const Agent = browserAgent()
```
