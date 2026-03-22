#!/usr/bin/env node
/**
 * Walkthrough: what this repo does + live API examples.
 * Start the server first: npm start
 */

const base = process.env.BASE_URL || "http://localhost:3000"

function title(s) {
  console.log("\n" + "=".repeat(60))
  console.log(s)
  console.log("=".repeat(60))
}

function note(s) {
  console.log("\n  " + s.replace(/\n/g, "\n  "))
}

async function req(method, path, body) {
  const url = `${base}${path}`
  const init = { method, headers: { "Content-Type": "application/json" } }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await fetch(url, init)
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { ok: res.ok, status: res.status, json }
}

async function main() {
  title("WHAT THIS REPO IS")
  note(`Three pieces:

  1. server.js     → HTTP API: POST /send (enqueue), GET /stats (snapshot)
  2. broker.js   → In-memory queue per topic, priority, retries, dead-letter queue
  3. consumers.js → Background workers: "emails" and "payments" topics

  Flow: You POST /send → message goes on a queue → a consumer picks it up later.
  /send returns 200 + { id } as soon as the message is queued, NOT when work finishes.
  Failures happen inside the consumer; the broker retries, then moves to DLQ.`)

  title("CHECK: is the server running?")
  let ping
  try {
    ping = await req("GET", "/")
  } catch (e) {
    console.error("\n  Could not reach", base)
    console.error("  Start the API in another terminal: npm start\n")
    process.exit(1)
  }
  if (!ping.ok) {
    console.error("  GET / failed:", ping.status, ping.json)
    process.exit(1)
  }
  console.log("  GET / →", ping.status, JSON.stringify(ping.json, null, 2))

  title("EXAMPLE 1 — Happy path: email")
  note("Enqueue an email task. Consumer runs in the background (small delay).")
  const email = await req("POST", "/send", {
    topic: "emails",
    payload: { to: "user@example.com", subject: "Hello!" },
    priority: 10
  })
  console.log("  POST /send →", email.status, JSON.stringify(email.json))

  title("EXAMPLE 2 — Payment that succeeds")
  const payOk = await req("POST", "/send", {
    topic: "payments",
    payload: { amount: 50 }
  })
  console.log("  POST /send →", payOk.status, JSON.stringify(payOk.json))

  title("EXAMPLE 3 — Payment that will FAIL in the consumer (amount ≤ 0)")
  note("HTTP still 200: enqueue succeeded. paymentWorker throws when it processes.")
  const payBad = await req("POST", "/send", {
    topic: "payments",
    payload: { amount: 0 }
  })
  console.log("  POST /send →", payBad.status, JSON.stringify(payBad.json))

  title("EXAMPLE 4 — Email that will FAIL and eventually go to DLQ")
  note("payload.fail → consumer throws. maxRetries: 2 → a few retries then dead queue.")
  const fail = await req("POST", "/send", {
    topic: "emails",
    payload: { fail: true },
    maxRetries: 2
  })
  console.log("  POST /send →", fail.status, JSON.stringify(fail.json))

  title("WAIT — consumers + retries are async")
  note("Polling GET /stats until the failing email shows up in dead (or 15s timeout).")
  const deadline = Date.now() + 15_000
  let lastStats = null
  while (Date.now() < deadline) {
    const s = await req("GET", "/stats")
    lastStats = s.json
    const emailsDead = lastStats?.emails?.dead ?? 0
    if (emailsDead >= 1) break
    await new Promise((r) => setTimeout(r, 200))
  }

  title("EXAMPLE 5 — GET /stats (queues + dead letters per topic)")
  console.log("  GET /stats →", JSON.stringify(lastStats, null, 2))

  title("DONE")
  note(`Tip: watch the terminal where "npm start" is running — you will see
  consumer activity and errors there.

  Tip: open the bruno/ folder in Bruno (or Insomnia) to resend these same calls.`)
  console.log("")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
