export const DomainAgents = {}                            // X not needed to sync, created on demand (deprecating anyway)
export const configuredDomains = {}                       // X not needed to sync, caches on demand
export const agents = {}                                  // X no need to sync, will re-create on demand
export const configCache = {}                             // X caches on demand
export const schemaCache = {}                             // X consider removing entirely if schema's no longer in use
export const outstandingCoreStateInteractions = new Set() // X okay to ignore as this tracks responses that will not come back
export const domainWorkers = {}                           // X not needed as they will be cached
export const gcpTokenCache = new Map()                    // X will be cached again
export const postgresClientPools = {}                     // X will be reconstructed
export const scopeToIdCache = {}                          // X will be reconstructed (can be tracked locally for speed...)

export const domainWorkerResponses = {}                   // O might be needed as error responses need to be sent (are these accounted for already with patch responses?)
export const guarantees = {}                              // O needs to be held across restarts

export const activeConnections = {}                       // O needs to be re-initialized across restarts
export const sessionMessageIndexes = {}                   // O needs to be held across restarts
export const responseBuffers = {}                         // O needs to be held across restarts
export const outstandingSideEffects = {}                  // O need to be able to return error code if any of these exist on startup
export const reconnectionPromiseResolvers = {}            // O pending reconnections need to be accounted for

export const subscriptionResponses = {}                   // O remember to set up subscriptions and send patch updates (some patch syncing probaby necessary)
export const subscriptions = {}                           // O needs to be reconstructed

//  TODO: deprecate old agents and this:
export const domainAgentConnections = {}
