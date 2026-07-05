import { describe, expect, it } from 'vitest'

import { modifyPaymentEndpoint } from '@/plugins/adyen/endpoints/modifyPayment'

describe('Adyen modify payment endpoints', () => {
  it('rejects non-admin users', async () => {
    const endpoint = modifyPaymentEndpoint(
      {
        apiKey: 'test-api-key',
        clientKey: 'test-client-key',
        merchantAccount: 'TestMerchant',
      },
      'refund',
    )

    const response = await endpoint.handler({
      user: {
        roles: ['customer'],
      },
    } as any)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      message: 'Admin access is required to modify Adyen payments.',
    })
  })
})
