# Recommended Dashboard Scaffold

This scaffold outlines our recommendation for how "dashboard type" applications can be embedded.
Dashboard applications using this recommendation can show individual user and group level performance.

This recommendation is a small extension of the [recommended application scaffold](/embedding/recommended-app-scaffold/).
If you haven't reviewed that yet, please check it out before reading this.

There are 3 types of uuid referencess relevant to this recommendation:

1.  User ids: These are the uuids for the users you care about
2.  Content ids: These are the uuids that reference the content that a user played.
    In our [recommended application scaffold](/embedding/recommended-app-scaffold/),
    these are the ones that were in the the embedded url's path.
3.  User Application States:
    These are the uuids that correspond to states returned when an application calls ```await Agent.state()``` on behalf of a user.

## The Embedding Application

It is up to the embedding application to assemble the uuids that reference all the data they want shown on a dashboard.

Once the ids are gathered (more details on how to effectively do so to be written), construct a new state in the following form:

```
DASHBOARD_CONFIG: {
  CONTENT_UUID: {
    states: Object[USER UUID => APPLICATION STATE UUID],
    embedded: DASHBOARD_CONFIG
  }
}
```

For a more fleshed out example of what the data might look like:

```js
//  All references in ALL CAPS below represent uuids of the above types
const dashboard_config_state = {
  ROOT_CONTENT_UUID: {
    states: {
      USER_UUID_1: null, // See note below about null states
      USER_UUID_2: USER_APPLICATION_STATE_1,
      USER_UUID_3: USER_APPLICATION_STATE_2
    },
    embedded: {
      CONTENT_UUID_1: {
        states: {
          USER_UUID_3: USER_APPLICATION_STATE_3
          USER_UUID_2: USER_APPLICATION_STATE_4
        },
        embedded: {}
      },
      CONTENT_UUID_2 {
        states: { USER_UUID_3: USER_APPLICATION_STATE_5 },
        embedded: {
          CONTENT_UUUD_3: {
            states: { USER_UUID_3: USER_APPLICATION_STATE_6 },
            embedded: {}
          }
        }
      }
    }
  }
}

const dashboard_config_id = await Agent.create({
  active_type: 'application/json;type=dashboard-config',
  active: dashboard_config_state
})
```

Once this state is constructed, send it to the dashboard application by embedding ```https://domain.for.dashboard.app/dashboard_config_id```

The embedding application's hard work is done, now it is up to the embedded application to render dashboards for the user application states appropriately.

!!! note

    It can be useful to have ```null``` states for users in the root of the dashboard config.
    Doing so allows a dashboard to show some sort of "no data yet" state for users we expect to see future data for.


## The Embedded Application

If an embedded application wants to show dashboards following this recommendation
it needs to add 1 extra check to the [recommended application scaffold](/embedding/recommended-app-scaffold/).
If the check for ```isUUID(potentialUUID)``` succeeds then, after the metadata arrives,
simply add a check for the dashboard-config type:

```js
if (metadata.active_type === 'application/json;type=dashboard-config') {
  //  Render dashboard assuming the structure outlined in the previous section
}
else {
  //  recognize other type and show appropriate content
}
```

We recommend the embedded application looks at the type of the content referenced in the root fields
(shown with the example value ROOT_CONTENT_ID above) then set up the appropriate per-user or group level visualizations.
