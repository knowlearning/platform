# Vue

## Persistent State for Composition API
```html
<script setup>
  import { reactive } from 'vue'

  const reactiveData = reactive({})

  Agent
    .state('my-count-state')
    .then(state => {
      // Initialize state if it hasn't been initialized yet.
      if (isNaN(state.count)) state.count = 0

      //  Add the persistent state to reactiveData so that
      //  it can be accessed and modified in the template.
      reactiveData.persistentState = state
    })

</script>

<template>
  <h1>Hello Vue 3</h1>
  <button
    v-if="reactiveData.persistentState"
    @click="reactiveData.persistentState.count++"
  >
    The current count is: {{ reactiveData.persistentState.count }}
  </button>
  <div v-else>Loading the current count</div>
</template>
```

## View State At a Scope
```html
<template>
  <!--
    simple example that will just render the text value of
    whatever data is at that scope
  -->
  <vueScopeComponent :id="scopeId" />

  <!-- simple example rendering the metadata at that scope -->
  <vueScopeComponent :id="scopeId" metadata/>

  <!--
    more advanced example rendering data inside that scope
  -->
  <vueScopeComponent
    :id="scopeId"
    :path="['field_name', 'deeper_field']"/>

  <!--
    Even more advanced example rendering data with a custom
    viewer for the data in the scope
  -->
  <vueScopeComponent
    :id="scopeId"
    v-slot="{ loading, value }"
  >
    My Custom Way To View The data at that Scope
    <span v-if="loading">Please hold...</span>
    <span v-else>Here you go!: {{value}}</span>
  </vueScopeComponent>
</template>

<script setup>
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'
  const scopeId = 'some-id-for-a-scope'
</script>

```

## Persistent State for Options API Components

### Application Root Components

You can create a vue application who's root component's state is automatically bound to a scope you specify:

```js
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import myComponent from './my-component-file.vue'

const id = 'uuid-or-name-of-scope-to-bind-to-component-data'
const root = vuePersistentComponent(myComponent, id)

const app = createApp(root)
app.mount()
```

Now all state updates to that component will be persisted, and the most recent state will be re-attached to on every reload.

### Child Components

A persistent component does not have to be used as the application root. You are free to make any component in your app a persistent component:

```html
<template>
  <div>
    <h1>Cool persistent component!</h1>
    <anyNameForMyPersistentComponent :importantProp="42">
  </div>
</template>

<script>
  import { vuePeristentComponent } from '@knowlearning/agents'
  import myComponent from './my-component-file.vue'

  const id = 'uuid-or-name-of-scope-to-bind-to-component-data'
  export default {
    components: {
      anyNameForMyPersistentComponent: vuePeristentComponent(myComponent, id)
    }
  }
</script>
```

## Persistent State for a Vuex Store

You can set up an app with a persistent store.

```js
import App from './app.vue'
import store from './store.js'

const store = createStore(await vuePersistentStore(store, 'name-for-store-state'))
const app = createApp(App)
app.use(store)
app.mount('#app')
```

Any time a user loads an app configured like this,
their store will reconnect to their persistent state.

## Embedded Content Component

You can embed other sites that use @knowlearning/agents like so:

```html
<template>
  <div>
    <vueEmbedComponent
      :id="id"
      @state="handleState"
      @mutate="handleMutate"
    />
  </div>
</template>

<script>
  import { vueEmbedComponent } from '@knowlearning/agents/vue.js'

  export default {
    components: {
      vueEmbedComponent
    },
    data() {
      return {
        id: "some-uuid-reference or url"
      }
    },
    methods: {
      handleState(event) {
        //  event will contain the id that the embedded content
        //  called Agent.state(id) on
      },
      handleMutate(event) {
        //  event will contain the id for a state that the
        //  embedded content has updated
      }
    }
  }
</script>
```

### How Embedded Content's Iframe URL is Resolved

The id passed into an embedded content component will be handled in the following way when deciding how to resolve the url to load into the embedded iframe:

- If ```id``` is a UUID, then the url for the iframe will be: ```https://DOMAIN_THAT_CREATED_UUID/UUID```.
  > For example: if ```dd3d48cf-82d7-43ab-8f5c-d2b7ab06a2ff``` is set as ```id```, then the vueEmbedComponent will look at the metadata for that UUID to find the domain where it was created. If, for instance, the domain that created that UUID is app.knowlearning.org, then the URL that vueEmbedComponent will load in its iframe is: ```https://app.knowlearning.org/dd3d48cf-82d7-43ab-8f5c-d2b7ab06a2ff```

- If ```id``` is already a valid URL with a domain included (like ```app.knowlearning.org``` or ```app.knowlearning.org/any-other-path``` or even ```app.knowlearning.org/cc3e48de-82d8-42bc-8f5c-d2b7ab06a2fa```), then vueEmbedComponent will simply load that url in its iframe.

!!! tip

    It is completely up to every domain owner to decide how to deal with URL paths, but we recommend all app creators check for a UUID passed as the path so that they can do something expected when an embedding app uses a UUID that belongs to their domain for the ```id``` of a vueEmbedComponent. Please see the "Recommended Scaffolding" to see an app structure we really recommend.
