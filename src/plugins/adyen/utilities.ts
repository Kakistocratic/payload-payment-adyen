import { createHmac, timingSafeEqual } from 'crypto'

import type {
  AdyenAdapterArgs,
  AdyenEnvironment,
  AdyenNotificationRequestItem,
} from './types'

const DEFAULT_API_VERSION = '71'

export const getAdyenCheckoutBaseURL = ({
  environment = 'test',
  liveEndpointUrlPrefix,
}: {
  environment?: AdyenEnvironment
  liveEndpointUrlPrefix?: string
}) => {
  if (environment === 'live') {
    if (!liveEndpointUrlPrefix) {
      throw new Error('Adyen liveEndpointUrlPrefix is required for live environment.')
    }

    return `https://${liveEndpointUrlPrefix}-checkout-live.adyenpayments.com/checkout`
  }

  return 'https://checkout-test.adyen.com'
}

export const getAdyenSessionsURL = (args: Pick<AdyenAdapterArgs, 'apiVersion' | 'environment' | 'liveEndpointUrlPrefix'>) => {
  const baseURL = getAdyenCheckoutBaseURL(args)
  const apiVersion = args.apiVersion || DEFAULT_API_VERSION

  return `${baseURL}/v${apiVersion}/sessions`
}

export const getAdyenPaymentModificationURL = (
  args: Pick<AdyenAdapterArgs, 'apiVersion' | 'environment' | 'liveEndpointUrlPrefix'>,
  paymentPspReference: string,
  operation: 'cancels' | 'captures' | 'refunds',
) => {
  const baseURL = getAdyenCheckoutBaseURL(args)
  const apiVersion = args.apiVersion || DEFAULT_API_VERSION

  return `${baseURL}/v${apiVersion}/payments/${encodeURIComponent(paymentPspReference)}/${operation}`
}

export const flattenCartItems = (items: NonNullable<unknown[]>) => {
  return items.map((item) => {
    if (!item || typeof item !== 'object') {
      return item
    }

    const cartItem = item as {
      product?: { id?: unknown } | unknown
      quantity?: unknown
      variant?: { id?: unknown } | unknown
      [key: string]: unknown
    }

    const productID =
      cartItem.product && typeof cartItem.product === 'object' && 'id' in cartItem.product
        ? cartItem.product.id
        : cartItem.product

    const variantID =
      cartItem.variant && typeof cartItem.variant === 'object' && 'id' in cartItem.variant
        ? cartItem.variant.id
        : cartItem.variant

    const { id: _id, product: _product, variant: _variant, ...customProperties } = cartItem

    return {
      ...customProperties,
      product: productID,
      quantity: cartItem.quantity,
      ...(variantID ? { variant: variantID } : {}),
    }
  })
}

export const getShopperReference = (userID: unknown) => {
  if (userID === undefined || userID === null || userID === '') {
    return undefined
  }

  return `user-${String(userID)}`
}

export const getAdyenHMACPayload = (notification: AdyenNotificationRequestItem) => {
  return [
    notification.pspReference,
    notification.originalReference,
    notification.merchantAccountCode,
    notification.merchantReference,
    notification.amount?.value,
    notification.amount?.currency,
    notification.eventCode,
    notification.success,
  ]
    .map((value) => (value === undefined || value === null ? '' : String(value)))
    .join(':')
}

export const validateStandardNotificationHMAC = ({
  hmacKey,
  notification,
}: {
  hmacKey: string
  notification: AdyenNotificationRequestItem
}) => {
  const expectedSignature = notification.additionalData?.hmacSignature

  if (!expectedSignature) {
    return false
  }

  const hmac = createHmac('sha256', Buffer.from(hmacKey, 'hex'))
  hmac.update(getAdyenHMACPayload(notification), 'utf8')
  const calculatedSignature = hmac.digest('base64')

  const expected = Buffer.from(expectedSignature, 'base64')
  const calculated = Buffer.from(calculatedSignature, 'base64')

  if (expected.length !== calculated.length) {
    return false
  }

  return timingSafeEqual(expected, calculated)
}
