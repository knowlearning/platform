# Installation

Install using the package manager of your choice:

```sh
npm install @knowlearning/agents
# OR
pnpm install @knowlearning/agents
# OR
yarn install @knowlearning/agents
```

We recommend making ```Agent``` a global variable in your app:

```js
import { browserAgent } from '@knowlearning/agents'

window.Agent = browserAgent()
```

If you are not a fan of global variables, then you can access the browser agent any time, like so:

```js
import { browserAgent } from '@knowlearning/agents'

const Agent = browserAgent()
```

After the first time an agent is created, the ```browserAgent()``` call will return the same agent instance for you to use.