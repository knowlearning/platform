import Agent from '@knowlearning/agent'

window.Agent = Agent

Agent.watch('whatever', update => {
  console.log(update)
})

;(async () => {
  const x = await Agent.state('whatever')
  x.field = `new value! ${Date.now()}`
})()
