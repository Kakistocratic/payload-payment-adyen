import { describe, expect, it } from 'vitest'

import {
  getAdyenHMACPayload,
  getAdyenPaymentModificationURL,
  getAdyenSessionsURL,
  getShopperReference,
  flattenCartItems,
  validateStandardNotificationHMAC,
} from '@/plugins/adyen/utilities'
import type { AdyenNotificationRequestItem } from '@/plugins/adyen/types'

describe('Adyen utilities', () => {
  it('builds the standard notification HMAC payload in Adyen field order', () => {
    const notification: AdyenNotificationRequestItem = {
      amount: {
        currency: 'EUR',
        value: 1130,
      },
      eventCode: 'AUTHORISATION',
      merchantAccountCode: 'TestMerchant',
      merchantReference: 'TestPayment-1407325143704',
      pspReference: '7914073381342284',
      success: 'true',
    }

    expect(getAdyenHMACPayload(notification)).toBe(
      '7914073381342284::TestMerchant:TestPayment-1407325143704:1130:EUR:AUTHORISATION:true',
    )
  })

  it('validates the standard notification HMAC sample from Adyen docs', () => {
    const notification: AdyenNotificationRequestItem = {
      additionalData: {
        hmacSignature: 'coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0=',
      },
      amount: {
        currency: 'EUR',
        value: 1130,
      },
      eventCode: 'AUTHORISATION',
      eventDate: '2019-05-06T17:15:34.121+02:00',
      merchantAccountCode: 'TestMerchant',
      merchantReference: 'TestPayment-1407325143704',
      operations: ['CANCEL', 'CAPTURE', 'REFUND'],
      paymentMethod: 'visa',
      pspReference: '7914073381342284',
      success: 'true',
    }

    expect(
      validateStandardNotificationHMAC({
        hmacKey: '44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056',
        notification,
      }),
    ).toBe(true)
  })

  it('builds test and live Sessions API URLs', () => {
    expect(getAdyenSessionsURL({ environment: 'test' })).toBe(
      'https://checkout-test.adyen.com/v71/sessions',
    )

    expect(
      getAdyenSessionsURL({
        environment: 'live',
        liveEndpointUrlPrefix: 'example',
      }),
    ).toBe('https://example-checkout-live.adyenpayments.com/checkout/v71/sessions')
  })

  it('builds payment modification API URLs', () => {
    expect(getAdyenPaymentModificationURL({ environment: 'test' }, 'PSP/123', 'refunds')).toBe(
      'https://checkout-test.adyen.com/v71/payments/PSP%2F123/refunds',
    )
  })

  it('prefixes Payload user IDs for Adyen shopperReference compatibility', () => {
    expect(getShopperReference(1)).toBe('user-1')
    expect(getShopperReference('ab')).toBe('user-ab')
    expect(getShopperReference(undefined)).toBeUndefined()
  })

  it('removes cart array item IDs when copying items into transactions', () => {
    expect(
      flattenCartItems([
        {
          id: 'cart-array-row-id',
          product: {
            id: 2,
          },
          quantity: 1,
          variant: {
            id: 5,
          },
        },
      ]),
    ).toEqual([
      {
        product: 2,
        quantity: 1,
        variant: 5,
      },
    ])
  })
})
