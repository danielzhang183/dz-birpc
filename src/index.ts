import type { BirpcOptions, RPCMessage, Request, Response } from './types'
import { DEFAULT_TIMEOUT, defaultDeserialize, defaultSerialize } from './types'
import { nanoid } from './utils'

export function createBirpc<RemoteFunctions = {}, LocalFunctions = {}>(
  functions: LocalFunctions,
  options: BirpcOptions<RemoteFunctions>,
) {
  const {
    on,
    post,
    deserialize = defaultDeserialize,
    serialize = defaultSerialize,
    timeout = DEFAULT_TIMEOUT,
  } = options

  const rpcPromiseMap = new Map<string, { resolve: Function; reject: Function }>()

  let _promise: Promise<any> | any

  const rpc = new Proxy(
    {},
    {
      get(_, method: string) {
        if (method === '$functions')
          return functions

        const sendEvent = (...args: any[]) => {
          post(serialize(<Request>{ m: method, a: args, t: 'q' }))
        }
        const sendCall = async (...args: any[]) => {
          await _promise
          return new Promise((resolve, reject) => {
            const id = nanoid()
            rpcPromiseMap.set(id, { resolve, reject })
            post(serialize(<Request>{ m: method, a: args, t: 'q' }))
            if (timeout >= 0) {
              setTimeout(() => {
                reject(new Error(`[birpc] timeout on calling "${method}"`))
                rpcPromiseMap.delete(id)
              }, timeout)
            }
          })
        }
        sendCall.asEvent = sendEvent
        return sendCall
      },
    },
  )

  _promise = on(async (data: any, ...extra: any[]) => {
    console.log({ data })
    const msg = deserialize(data) as RPCMessage
    if (msg.t === 'q') {
      const { m: method, a: args } = msg
      let result, error: any
      const fn = (functions as any)[method]

      if (!fn) {
        error = new Error(`[birpc] function "${method}" not found`)
      }
      else {
        try {
          result = await fn.apply(rpc, args)
          console.log({ result })
        }
        catch (e) {
          error = e
        }
      }

      if (msg.i) {
        if (error && options.onError)
          options.onError(error, method, args)
        post(serialize(<Response>{
          t: 's',
          i: msg.i,
          r: result,
          e: error,
        }), ...extra)
      }
    }
    else {
      const { i: ack, r: result, e: error } = msg
      console.log({ ack })
      const promise = rpcPromiseMap.get(ack)
      if (promise) {
        if (error)
          promise.reject(error)
        else
          promise.resolve(result)
      }
      rpcPromiseMap.delete(ack)
    }
  })

  return rpc
}

export * from './types'
