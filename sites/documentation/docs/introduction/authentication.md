# Authentication

Authentication is a big serious word, and we take it very seriously;
but that doesn't mean it has to be hard!
Users can authenticate with our system in 2 main ways:
Through a single-sign-on provider (most common), or by validating an authentication request made by a server or device (advanced).

## Users Using SSO

### Login
The first concern of most applications is to get an authenticated user. To log a user in:

```javascript
const provider = 'google' // could also be "microsoft"
Agent.login(provider)
```

Calling this function prompts a user to login through the provider of your choice.

Once your user logs in, they are redirected back to your site. At this point you can see who logged in with:

```javascript
const env = await Agent.environment()
env.auth // -> an object with "id", and "provider" fields
```

The id is unique to that user. The same id is never re-used with different providers.

### Logout

Once your user has logged in, you can log them out with:

```javascript
Agent.logout()
```

Calling that function will dump authentication credentials and reload the application.

### Anonymous Users

What if you call ```Agent.environment()``` before a user has logged in? You will get an environment object like above, but the provider will be ```"anonymous"```. This is very useful if your application is deciding to show a login page or not.

!!! warning

    An anonymous user's session can end at any time. Do not rely on anonymous accounts unless it is okay for your application to lose the ability to re-authenticate that user after their session has ended. For most applications, you probably want to immediately show anonymous users a login page.

## Validating Third Party Requests

Coming soon.