export const DomainAgents = {}  // not needed to sync, created on demand (deprecating anyway)
export const configuredDomains = {} // not needed to sync, caches on demand
export const agents = {} // no need to sync, will re-create on demand
export const configCache = {} // X caches on demand
export const schemaCache = {} // X consider removing entirely if schema's no longer in use
export const outstandingCoreStateInteractions = new Set() // X okay to ignore as this tracks responses that will not come back
export const domainWorkers = {} // X not needed as they will be cached
export const domainWorkerResponses = {} // O might be needed as error responses need to be sent (are these accounted for already with patch responses?)
export const gcpTokenCache = new Map() // X will be cached again
export const guarantees = {} // O needs to be held across closures

export const activeConnections = {}
export const sessionMessageIndexes = {}
export const responseBuffers = {}
export const outstandingSideEffects = {}
export const reconnectionPromiseResolvers = {}

export const postgresClientPools = {}
export const scopeToIdCache = {}
export const subscriptionResponses = {}
export const subscriptions = {}

//  TODO: deprecate old agents and this:
export const domainAgentConnections = {}
