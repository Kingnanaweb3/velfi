const BACKEND_URL = 'http://localhost:3001'
const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space'

export async function storeReceipt(receipt) {
  try {
    const response = await fetch(`${BACKEND_URL}/walrus/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...receipt,
        app: 'velfi.ai',
        network: 'sui-testnet',
        timestamp: new Date().toISOString(),
      })
    })

    if (!response.ok) throw new Error('Store failed')
    const result = await response.json()
    return result.blobId || null
  } catch (err) {
    console.warn('Walrus receipt failed:', err.message)
    return null
  }
}

export async function getReceipt(blobId) {
  try {
    const response = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`)
    if (!response.ok) throw new Error('Not found')
    return await response.json()
  } catch {
    return null
  }
}
