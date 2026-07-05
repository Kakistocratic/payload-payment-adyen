import { describe, expect, it, vi } from 'vitest'

import { completeAdyenOrder } from '@/plugins/adyen/completeOrder'

const createMockReq = () =>
  ({
    payload: {
      create: vi.fn().mockResolvedValue({
        accessToken: 'order-access-token',
        id: 'order-1',
      }),
      db: {
        updateOne: vi.fn(),
      },
      findByID: vi.fn().mockResolvedValue({
        accessToken: 'existing-order-access-token',
        id: 'order-1',
      }),
      update: vi.fn(),
    },
  }) as any

describe('completeAdyenOrder', () => {
  it('creates an order and decrements inventory for a new webhook completion', async () => {
    const req = createMockReq()

    const result = await completeAdyenOrder({
      decrementInventory: true,
      paymentMethod: 'visa',
      pspReference: 'PSP123',
      req,
      resultCode: 'Authorised',
      transaction: {
        adyen: {
          sessionID: 'session-1',
          shippingAddress: {
            city: 'Amsterdam',
          },
        },
        amount: 1000,
        cart: 'cart-1',
        currency: 'EUR',
        customerEmail: 'shopper@example.com',
        id: 'transaction-1',
        items: [
          {
            product: 'product-1',
            quantity: 2,
            variant: 'variant-1',
          },
        ],
      },
    })

    expect(result).toMatchObject({
      accessToken: 'order-access-token',
      created: true,
      orderID: 'order-1',
      transactionID: 'transaction-1',
    })
    expect(req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'orders',
        data: expect.objectContaining({
          customerEmail: 'shopper@example.com',
          shippingAddress: {
            city: 'Amsterdam',
          },
          transactions: ['transaction-1'],
        }),
      }),
    )
    expect(req.payload.update).toHaveBeenCalledTimes(2)
    expect(req.payload.db.updateOne).toHaveBeenCalledWith({
      collection: 'variants',
      data: {
        inventory: {
          $inc: -2,
        },
      },
      id: 'variant-1',
    })
  })

  it('returns an existing order without creating or decrementing again', async () => {
    const req = createMockReq()

    const result = await completeAdyenOrder({
      decrementInventory: true,
      req,
      transaction: {
        id: 'transaction-1',
        order: 'order-1',
      },
    })

    expect(result).toMatchObject({
      accessToken: 'existing-order-access-token',
      created: false,
      orderID: 'order-1',
      transactionID: 'transaction-1',
    })
    expect(req.payload.create).not.toHaveBeenCalled()
    expect(req.payload.update).not.toHaveBeenCalled()
    expect(req.payload.db.updateOne).not.toHaveBeenCalled()
  })
})
