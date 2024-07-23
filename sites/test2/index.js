import Agent from '@knowlearning/agent'

window.Agent = Agent

Agent.watch('whatever', update => {
  console.log(update)
})

;(async () => {
  const x = await Agent.state('whatever')
  console.log('OLD VALUE', x)
  x.field = `new value! ${Date.now()}`
})()
