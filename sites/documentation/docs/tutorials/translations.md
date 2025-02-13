# Translations

While its not part of the official core, KnowLearning infrastructure provides
translation infrastructure to some domains through [translations.pilaproject.org](https://translations.pilaproject.org).

To utilize this infrastructure you will need to do 4 things:

1. Write a "translations" field into any scopes that you want to be translatable.
1. Add some domain agent functionality so that your domain can forward data for
   translatable items to [translations.pilaproject.org](https://translations.pilaproject.org).
1. Add some translations on [translations.pilaproject.org](https://translations.pilaproject.org).
1. Process any translatable scope after fetching to apply all available translations.

## Making scopes translatable

You can make any scope translatable by adding a "translations" field that contains references to the
translatable parts of the scope.

Here's an example scope that we will make translatable in the next step:

```json
{
    "name": "zebra",
    "legs": 4,
    "colors": ["white", "black"]
}
```

Here we see some data that might need to be translated, and some that probably doesn't.
If we want to make some parts of this object translatable, all we need to do is add one field
like so:


```json
{
    "name": "zebra",
    "legs": 4,
    "colors": ["white", "black"],
    "translations": {
        "source_language": "en",
        "paths": [
            ["name"],
            ["colors", 0],
            ["colors", 1]
        ]
    }
}
```

That's all you will need to do from the front end to make a scope's fields translatable.
BUT, before doing that on the front-end, you need to make sure your domain agent is ready
to forward translatable info to [translations.pilaproject.org](https://translations.pilaproject.org).

## Setting Up Your Domain Agent to Forward Translatable Info

To configure your domain agent to forward translatable info to [translations.pilaproject.org](https://translations.pilaproject.org),
add the following snippet to your domain agent. It will simply forward all of a scopes current
translation info for translated paths.

```js
  import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'

  const TRANSLATION_DOMAIN = 'translations.pilaproject.orgs'
  const TRANSLATABLE_TARGET_TYPE = 'application/json;type=translatable_target'

  const TranslationAgent = getAgent(TRANSLATION_DOMAIN)

  Agent.on('child', child => {
    child.on('mutate', async ({ id }) => {
      if (await isTranslatableItem(id)) {
        await handleTranslatableItem(id)
      }
    })
  })

  async function handleTranslatableItem(id) {
    const itemState = await TranslationAgent.state(id)
    itemState.translations.paths.forEach(async path => {
      const translatableTargetName = `translatable_target/${JSON.stringify([id, ...path])}`
      const translatableTargetMetadata = await TranslationAgent.metadata(translatableTargetName)

      if (translatableTargetMetadata.active_type !== TRANSLATABLE_TARGET_TYPE) {
        translatableTargetMetadata.active_type = TRANSLATABLE_TARGET_TYPE
      }

      const translatableTarget = await TranslationAgent.state(translatableTargetName)
      const source_string = resolvePath([...path], itemState)

      translatableTarget.source_language = itemState.translations.source_language
      translatableTarget.source_string = source_string || null
      translatableTarget.path = [id, ...path]
    })
  }

  function resolvePath(path, value) {
      while (path.length && value) value = value[path.shift()]
      return value
    }

  async function isTranslatableItem(id) {
    const state = await Agent.state(id)
    return !!state.translations
  }
 ```

##  Add Some Translations

Go to translations.pilaproject.org/your-domain.example.com and you will
be greeted with the most recently submitted translatable items. You can
also search source languages and translations to find the translatable item
you are looking for.

If you want to start translating in a particular language, add a language to the
table and switch the edit toggle to on. Start translating as much as you would like!

## Translating Scopes On Your Domain

Once you've translated some scopes on [translations.pilaproject.org](https://translations.pilaproject.org),
you'll be able to render your translations back on your app!

Whenever you want to get the translated version of this scope, you can use this function:

```js

  async function translatedObject(id, languages) {
    const translations = await Agent.query('translate-item', [id, languages], TRANSLATION_DOMAIN)
    let translated = JSON.parse(JSON.stringify(await Agent.state(id)))

    translations
      .forEach(({ path, value }) => {
        let ref = translated
        const p = path.slice(1)
        while (p.length > 1 && ref[p[0]]) ref = ref[p.shift()]
        ref[p[0]] = value
      })

      delete translated.translations

      return translated
  }


```

Use it like this:

```js
  const id = 'my-zebra-scope'
  const languages = ['es-ES', 'es']
  const translatedData = await translatedObject(id, languages)
```

This languages list specifies that we want to use es-ES (spanish from spain) but if
translations are not available for that to use the more general "es" (general spanish).

If the ```'my-zebra-scope'``` contained the data of our example above, and we added
spanish translations to [translations.pilaproject.org](https://translations.pilaproject.org),
then ```translatedData``` should be something like:

```js
{
    "name": "cebra",
    "legs": 4,
    "colors": ["blanco", "negro"]
}
```

Now you can use that translated scope in your application and have language appropriate strings render.
