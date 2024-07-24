import { state } from './synchronization.js'

export async function create({ id, active }) {
  console.warn(`Agent.create is deprecated. Please use await Agent.state('new name') to initialize state`)
  Object.assign(await state(id), active)
}