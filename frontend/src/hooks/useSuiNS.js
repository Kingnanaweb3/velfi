import { useSuiClient } from '@mysten/dapp-kit'
import { useState, useCallback } from 'react'

export function useSuiNS() {
  const client = useSuiClient()
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState(null)

  const resolve = useCallback(async (input) => {
    setError(null)

    // Already a wallet address
    if (input.startsWith('0x') && input.length >= 20) {
      return input
    }

    // Add .sui if missing
    const name = input.endsWith('.sui') ? input : input + '.sui'

    setResolving(true)
    try {
      // SuiNS resolution via dynamic field lookup
      const result = await client.call('suix_resolveNameServiceAddress', [name])
      setResolving(false)
      if (!result) {
        setError(`Name "${name}" not found`)
        return null
      }
      return result
    } catch (err) {
      setResolving(false)
      setError(`Could not resolve "${name}"`)
      return null
    }
  }, [client])

  return { resolve, resolving, error }
}
