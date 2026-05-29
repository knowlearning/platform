export const DomainAgents = {}
export const configuredDomains = {}
export const agents = {}
export const configCache = {}
export const storageRouteCache = {}
export const outstandingCoreStateInteractions = new Set()
export const domainWorkers = {}
export const domainWorkerResponses = {}
export const gcpTokenCache = new Map()
export const guarantees = {}

export const activeConnections = {}
export const activeConnectionInfo = {}
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
