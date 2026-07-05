import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'

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

      if (transaction.order) {
        const orderID =
          typeof transaction.order === 'object' && transaction.order
            ? transaction.order.id
            : transaction.order

        return {
          message: 'Order already confirmed',
          orderID,
          transactionID: transaction.id,
        }
      }

      const cartID =
        typeof transaction.cart === 'object' && transaction.cart ? transaction.cart.id : transaction.cart

      if (!cartID) {
        throw new Error('Cart ID not found on transaction.')
      }

      const order = (await payload.create({
        collection: ordersSlug,
        data: {
          amount: transaction.amount,
          currency: transaction.currency,
          ...(req.user
            ? {
                customer: req.user.id,
              }
            : {
                customerEmail,
              }),
          items: transaction.items,
          shippingAddress: data.shippingAddress,
          status: 'processing',
          transactions: [transaction.id],
        },
        req,
      })) as any

      await payload.update({
        id: cartID,
        collection: cartsSlug,
        data: {
          purchasedAt: new Date().toISOString(),
        },
        req,
      })

      await payload.update({
        id: transaction.id,
        collection: transactionsSlug,
        data: {
          adyen: {
            ...(transaction.adyen || {}),
            pspReference,
            resultCode,
          },
          order: order.id,
          status: 'succeeded',
        },
        req,
      })

      return {
        message: 'Order confirmed successfully',
        orderID: order.id,
        transactionID: transaction.id,
        ...(order.accessToken
          ? {
              accessToken: order.accessToken,
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
