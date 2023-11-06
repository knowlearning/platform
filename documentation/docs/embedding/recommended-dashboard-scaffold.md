# Recommended Dashboard Scaffold

The goal of this scaffold is to outline a simple, but powerful way for applications that embed other content to also ask the embedded domains to show dashboards that represent both individual user and group level performance.

This recommendation is a small extension of the [recommended application scaffold](/embedding/recommended-app-scaffold/).
If you haven't reviewed that yet, please check it out.

There are 3 types of uuids relevant to this recommendation:

1.  User ids: These are the uuids for the users you care about
2.  Content ids: These are the uuids that reference the content that a user played.
    In our [recommended application scaffold](/embedding/recommended-app-scaffold/),
    these are the ones that were in the path for embedded content.
3.  User Application States:
    These are the uuids that correspond to the states returned to the user when the application called ```await Agent.state()```.

## The Embedding Application

It is up to the embedder to assemble several uuids that reference all the data they want to show on the dashboards.

Once you have all these ids assembled (more details on how to effectively do so to be written), construct a new state in the following form:

```js
const dashoboard_config_state = {
  CONTENT_UUID_1: {
    USER_UUID_1: USER_APPLICATION_STATE_UUID_1,
    USER_UUID_2: USER_APPLICATION_STATE_UUID_2
  },
  CONTENT_UUID_2: {
    USER_UUID_1: USER_APPLICATION_STATE_UUID_3,
    USER_UUID_2: USER_APPLICATION_STATE_UUID_4
  }
}

const dashboard_config_id = await Agent.create({
  active_type: 'application/json;type=dashboard-config',
  active: dashboard_config_state
})
```

Once you have constructed this state, send it to the dashboard application by embedding ```https://domain.for.dashboard.app/dashboard_config_id```

The embedding application's hard work is done, now it is up to the embedded application to render dashboards for the user application states appropriately.

## The Embedded Application

If an embedded application wants to adhere to this dashboard recommendation,
it needs to add 1 extra check to the [recommended application scaffold](/embedding/recommended-app-scaffold/).
If the check for ```isUUID(potentialUUID)``` passes then, after the metadata arrives,
simply add a check for the dashboard-config type:

```js
if (metadata.active_type === 'application/json;type=dashboard-config') {
  //  Render dashboard assuming the structure outlined in the previous section
}
else {
  //  recognize other type and show appropriate content
}
```

We recommend the embedded application looks through the set of content ids supplied to determine what type of dashboards to show,
then sets up the appropriate per-user or group level visualizations.
