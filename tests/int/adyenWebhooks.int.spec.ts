import { describe, expect, it, vi } from 'vitest'

import { webhooksEndpoint } from 'payload-payment-adyen'

const createReq = ({
  notification,
  transaction,
}: {
  notification: Record<string, unknown>
  transaction?: Record<string, any>
}) =>
  ({
    json: vi.fn().mockResolvedValue({
      notificationItems: [
        {
          NotificationRequestItem: notification,
        },
      ],
    }),
    payload: {
      find: vi.fn().mockResolvedValue({
        docs: transaction ? [transaction] : [],
      }),
      findByID: vi.fn().mockResolvedValue(transaction),
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
      update: vi.fn().mockResolvedValue({}),
    },
  }) as any

describe('webhooksEndpoint', () => {
  it('skips duplicate transaction webhook events before writing or calling custom handlers', async () => {
    const handler = vi.fn()
    const notification = {
      eventCode: 'AUTHORISATION',
      merchantReference: 'cart-1',
      pspReference: 'PSP123',
      success: 'true',
    }
    const req = createReq({
      notification,
      transaction: {
        adyen: {
          merchantReference: 'cart-1',
          webhookEvents: [
            {
              key: 'AUTHORISATION:PSP123',
            },
          ],
        },
        id: 'transaction-1',
      },
    })

    const endpoint = webhooksEndpoint({
      webhooks: {
        AUTHORISATION: handler,
      },
    })
    const response = await endpoint.handler(req)

    expect(response.status).toBe(200)
    expect(req.payload.update).not.toHaveBeenCalled()
    expect(req.payload.findByID).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
    expect(req.payload.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Skipping duplicate Adyen webhook event',
      }),
    )
  })

  it('records a processed webhook event key after successful reconciliation', async () => {
    const notification = {
      eventCode: 'AUTHORISATION',
      merchantReference: 'cart-1',
      paymentMethod: 'visa',
      pspReference: 'PSP123',
      success: 'false',
    }
    const transaction = {
      adyen: {
        merchantReference: 'cart-1',
      },
      id: 'transaction-1',
    }
    const req = createReq({
      notification,
      transaction,
    })

    const endpoint = webhooksEndpoint({})
    const response = await endpoint.handler(req)

    expect(response.status).toBe(200)
    expect(req.payload.update).toHaveBeenCalledTimes(2)
    expect(req.payload.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collection: 'transactions',
        data: {
          adyen: expect.objectContaining({
            webhookEvents: [
              expect.objectContaining({
                eventCode: 'AUTHORISATION',
                key: 'AUTHORISATION:PSP123',
                pspReference: 'PSP123',
                success: 'false',
              }),
            ],
          }),
        },
        id: 'transaction-1',
      }),
    )
  })
})
