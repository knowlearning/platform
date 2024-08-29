import handleSideEffects from './handle-side-effects.js'
import handleAuthRequest from './handle-auth-request.js'
import { nc } from './nats.js'

window.CORE_HACK = 'TODO: REMOVE THIS HACK SHORTCUT'

nc.subscribe("$SYS.REQ.USER.AUTH", { callback: handleAuthRequest })
nc.subscribe("effects.patch.>", { queue: "all-streams-queue", callback: handleSideEffects })
