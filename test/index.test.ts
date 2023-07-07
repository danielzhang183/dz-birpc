import { MessageChannel } from 'node:worker_threads'
import { expect, it } from 'vitest'
import { createBirpc } from '../src'
import * as Alice from './alice'
import * as Bob from './bob'

type AliceFunctions = typeof Alice
type BobFunctions = typeof Bob

it('basic', async () => {
  const channel = new MessageChannel()
  console.log({ channel })

  const bob = createBirpc<AliceFunctions>(
    Bob,
    {
      post: data => channel.port1.postMessage(data),
      on: data => channel.port1.on('message', data),
    },
  )

  const alice = createBirpc<BobFunctions>(
    Alice,
    {
      post: data => channel.port2.postMessage(data),
      on: data => channel.port2.on('message', data),
    },
  )

  expect(await bob.hello('Bob'))
    .toMatchInlineSnapshot()
  expect(await alice.hi('Alice'))
    .toMatchInlineSnapshot()
})
