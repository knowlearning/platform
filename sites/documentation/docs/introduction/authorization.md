# Authorization

## Authorization For Third Parties

All users are passed a JSON Web Token (JWT) as part of the response to ```Agent.environment()```.

This JWT can be passed to a third party service as part of an authorization flow.

The response comes in this form:

```js
const environment = await Agent.environment()
const JWT = environment.auth.JWT
```

On the back end, you can verify that the JWT came from KnowLearning by using a public key to ensure that the JWT was signed with KnowLearning's private key.
Here is a link to KnowLearning's [public key](https://auth.knowlearning.systems/PUBLIC_KEY).

Here's an example of doing so using our public key (can be passed in as a string) and the [jsonwebtoken package](https://www.npmjs.com/package/jsonwebtoken):

```js
import jwt from 'jsonwebtoken'

jwt.verify(token, PUBLIC_KEY, function(err, decodedJWTPayload) {
  console.log(decodedJWTPayload)
})

```
