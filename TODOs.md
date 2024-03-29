- [ ] Take postgres out of managed service and use deployable instance
- [ ] Dont' rely on redis for base representation of data
  -  stream all uuids into stored file named domain (stream into gcs as well)
  -  stream all updates to uuids into file named uuid (stream into gcs as well)
- [ ]  Auth service needs to associate 1 time use auth token with a domain, so that only auth requests with a token from that domain are treated as valid (great redis expiring key use case)
- [ ]  Throw error instead of returning undefined when cross domain query fails (fails when points at wrong domain/no query configured)
- [ ]  Semicolons at the end of queries in configuration shouldn't cause them to break
- [ ]  Add reasonable timeout for JWT token verification (expired tokens might take a long time to come back as expired, causing front end to seem to hang)
- [ ]  Optimize table updates
- [ ]  Embeded agent create sessions w/ context
- [ ]  Embedding agent passes embed start time for embedded agent to record in addition to load + other times
- [ ]  History Download
- [ ]  Compaction
- [ ]  Per user resource usage tracking
- [ ]  Throttle naughty clients (protect against infinite loops on the client)
