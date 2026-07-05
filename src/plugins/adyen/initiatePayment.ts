import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'

import type { AdyenAdapterArgs, AdyenSessionResponse } from './types'
import { flattenCartItems, getAdyenSessionsURL, getShopperReference } from './utilities'

type InitiatePayment = PaymentAdapter['initiatePayment']

export const initiatePayment =
  (props: AdyenAdapterArgs): InitiatePayment =>
  async ({ data, req, transactionsSlug }) => {
    const payload = req.payload as any
    const { apiKey, merchantAccount, returnURL } = props

    const customerEmail = data.customerEmail
    const currency = data.currency
    const cart = data.cart
    const amount = cart.subtotal
    const billingAddress = data.billingAddress
    const shippingAddress = data.shippingAddress || billingAddress
    const additionalData = data as typeof data & {
      countryCode?: unknown
      shopperLocale?: unknown
    }
    const shopperLocale =
      typeof additionalData.shopperLocale === 'string'
        ? additionalData.shopperLocale
        : props.shopperLocale
    const countryCode =
      typeof additionalData.countryCode === 'string'
        ? additionalData.countryCode
        : typeof billingAddress?.country === 'string'
          ? billingAddress.country
          : undefined

    if (!apiKey) {
      throw new Error('Adyen API key is required.')
    }

    if (!merchantAccount) {
      throw new Error('Adyen merchant account is required.')
    }

    if (!currency) {
      throw new Error('Currency is required.')
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new Error('Cart is empty or not provided.')
    }

    if (!customerEmail || typeof customerEmail !== 'string') {
      throw new Error('A valid customer email is required to make a purchase.')
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error('A valid amount is required to initiate a payment.')
    }

    const flattenedCart = flattenCartItems(cart.items)
    const merchantReference = `cart-${cart.id}-${crypto.randomUUID()}`
    const returnUrl =
      returnURL || `${process.env.NEXT_PUBLIC_SERVER_URL || ''}/checkout/confirm-order`

    try {
      const sessionRequest = {
        amount: {
          currency,
          value: amount,
        },
        channel: 'Web',
        countryCode,
        ...(props.forceRedirectThreeDS
          ? {
              authenticationData: {
                threeDSRequestData: {
                  nativeThreeDS: 'disabled',
                },
              },
            }
          : {}),
        merchantAccount,
        reference: merchantReference,
        returnUrl,
        shopperEmail: customerEmail,
        shopperLocale,
        shopperReference: getShopperReference(req.user?.id),
      }

      const response = await fetch(getAdyenSessionsURL(props), {
        body: JSON.stringify(sessionRequest),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': merchantReference,
          'x-api-key': apiKey,
        },
        method: 'POST',
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Adyen session creation failed with ${response.status}: ${errorBody}`)
      }

      const session = (await response.json()) as AdyenSessionResponse

      if (!session.id || !session.sessionData) {
        throw new Error('Adyen session response did not include id and sessionData.')
      }

      await payload.create({
        collection: transactionsSlug,
        data: {
          ...(req.user
            ? {
                customer: req.user.id,
              }
            : {
                customerEmail,
              }),
          adyen: {
            merchantReference,
            sessionID: session.id,
            shippingAddress,
            shopperLocale,
          },
          amount,
          billingAddress,
          cart: cart.id,
          currency: currency.toUpperCase(),
          items: flattenedCart,
          paymentMethod: 'adyen',
          status: 'pending',
        },
        req,
      })

      return {
        id: session.id,
        amount: {
          currency,
          value: amount,
        },
        countryCode,
        locale: shopperLocale,
        message: 'Payment initiated successfully',
        merchantReference,
        sessionData: session.sessionData,
        ...(props.translations ? { translations: props.translations } : {}),
      }
    } catch (error) {
      payload.logger.error({
        err: error,
        msg: 'Error initiating payment with Adyen',
      })
      throw new Error(error instanceof Error ? error.message : 'Unknown error initiating payment')
    }
  }
