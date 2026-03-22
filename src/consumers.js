import { Broker } from "./broker.js"
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
function register() {
  const stopEmail = Broker.subscribe("emails", async (payload) => {
    await sleep(100)
    if (payload.fail) throw new Error("fail")
  }, { prefetch: 5 })
  const stopPayments = Broker.subscribe("payments", async (payload) => {
    await sleep(50)
    if (payload.amount <= 0) throw new Error("invalid")
  }, { prefetch: 2 })
  return [stopEmail, stopPayments]
}
export const Consumers = { register }
