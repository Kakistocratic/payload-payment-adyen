import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'

import { completeAdyenOrder } from './completeOrder'
import type { AdyenAdapterArgs } from './types'

type ConfirmOrder = PaymentAdapter['confirmOrder']

const successfulResultCodes = new Set(['Authorised'])

export const confirmOrder =
  (_props: AdyenAdapterArgs): ConfirmOrder =>
  async ({
    cartsSlug = 'carts',
    data,
    ordersSlug = 'orders',
    req,
    transactionsSlug = 'transactions',
  }) => {
    const payload = req.payload as any
    const customerEmail = data.customerEmail
    const sessionID = data.sessionID
    const resultCode = data.resultCode
    const pspReference = data.pspReference
    const sessionResult = data.sessionResult

    if (!sessionID || typeof sessionID !== 'string') {
      throw new Error('Adyen session ID is required.')
    }

    if (!resultCode || typeof resultCode !== 'string') {
      throw new Error('Adyen resultCode is required.')
    }

    if (!successfulResultCodes.has(resultCode)) {
      throw new Error(`Adyen payment was not authorised. Result code: ${resultCode}`)
    }

    try {
      const transactionsResults = await payload.find({
        collection: transactionsSlug,
        req,
        where: {
          'adyen.sessionID': {
            equals: sessionID,
          },
        },
      })

      const transaction = transactionsResults.docs[0] as any

      if (!transactionsResults.totalDocs || !transaction) {
        throw new Error('No transaction found for the provided Adyen session ID.')
      }

      const orderResult = await completeAdyenOrder({
        cartsSlug,
        customerEmail,
        ordersSlug,
        pspReference,
        req,
        resultCode,
        sessionResult,
        shippingAddress: data.shippingAddress,
        transaction,
        transactionsSlug,
      })

      return {
        message: orderResult.message,
        orderID: orderResult.orderID,
        transactionID: orderResult.created ? transaction.id : '',
        ...(orderResult.accessToken
          ? {
              accessToken: orderResult.accessToken,
            }
          : {}),
      }
    } catch (error) {
      payload.logger.error({
        err: error,
        msg: 'Error confirming order with Adyen',
      })
      throw new Error(error instanceof Error ? error.message : 'Unknown error confirming order')
    }
  }
