import type { PayloadRequest } from 'payload'

type CompleteAdyenOrderArgs = {
  cartsSlug?: string
  customerEmail?: string
  decrementInventory?: boolean
  eventCode?: string
  ordersSlug?: string
  paymentMethod?: string
  productsSlug?: string
  pspReference?: string
  req: PayloadRequest
  resultCode?: string
  sessionResult?: string
  sessionID?: string
  shippingAddress?: unknown
  transaction: Record<string, any>
  transactionsSlug?: string
  variantsSlug?: string
}

const getID = (value: unknown) => {
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id?: unknown }).id
  }

  return value
}

const decrementInventoryForItems = async ({
  items,
  productsSlug = 'products',
  req,
  variantsSlug = 'variants',
}: {
  items?: unknown
  productsSlug?: string
  req: PayloadRequest
  variantsSlug?: string
}) => {
  if (!Array.isArray(items)) {
    return
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const cartItem = item as {
      product?: unknown
      quantity?: number
      variant?: unknown
    }

    if (!cartItem.quantity) {
      continue
    }

    if (cartItem.variant) {
      await (req.payload.db as any).updateOne({
        id: getID(cartItem.variant),
        collection: variantsSlug,
        data: {
          inventory: {
            $inc: cartItem.quantity * -1,
          },
        },
      })
    } else if (cartItem.product) {
      await (req.payload.db as any).updateOne({
        id: getID(cartItem.product),
        collection: productsSlug,
        data: {
          inventory: {
            $inc: cartItem.quantity * -1,
          },
        },
      })
    }
  }
}

const getExistingOrderResponse = async ({
  order,
  ordersSlug = 'orders',
  req,
  transactionID,
}: {
  order: unknown
  ordersSlug?: string
  req: PayloadRequest
  transactionID: unknown
}) => {
  const orderID = getID(order)
  let accessToken =
    order && typeof order === 'object' && 'accessToken' in order
      ? (order as { accessToken?: unknown }).accessToken
      : undefined

  if (orderID && !accessToken) {
    const orderDoc = (await (req.payload as any).findByID({
      id: orderID,
      collection: ordersSlug,
      req,
      select: {
        accessToken: true,
        id: true,
      },
    })) as { accessToken?: unknown } | null

    accessToken = orderDoc?.accessToken
  }

  return {
    created: false,
    message: 'Order already confirmed',
    orderID,
    ...(typeof accessToken === 'string' ? { accessToken } : {}),
    transactionID,
  }
}

export const completeAdyenOrder = async ({
  cartsSlug = 'carts',
  customerEmail,
  decrementInventory = false,
  eventCode,
  ordersSlug = 'orders',
  paymentMethod,
  productsSlug = 'products',
  pspReference,
  req,
  resultCode,
  sessionResult,
  sessionID,
  shippingAddress,
  transaction,
  transactionsSlug = 'transactions',
  variantsSlug = 'variants',
}: CompleteAdyenOrderArgs) => {
  if (transaction.order) {
    return getExistingOrderResponse({
      order: transaction.order,
      ordersSlug,
      req,
      transactionID: transaction.id,
    })
  }

  const cartID = getID(transaction.cart)

  if (!cartID) {
    throw new Error('Cart ID not found on transaction.')
  }

  const customerID = getID(transaction.customer)
  const resolvedShippingAddress =
    shippingAddress || transaction.adyen?.shippingAddress || transaction.billingAddress

  const order = (await (req.payload as any).create({
    collection: ordersSlug,
    data: {
      amount: transaction.amount,
      currency: transaction.currency,
      ...(customerID
        ? {
            customer: customerID,
          }
        : {
            customerEmail: customerEmail || transaction.customerEmail,
          }),
      items: transaction.items,
      shippingAddress: resolvedShippingAddress,
      status: 'processing',
      transactions: [transaction.id],
    },
    req,
  })) as Record<string, any>

  await (req.payload as any).update({
    id: cartID,
    collection: cartsSlug,
    data: {
      purchasedAt: new Date().toISOString(),
    },
    req,
  })

  await (req.payload as any).update({
    id: transaction.id,
    collection: transactionsSlug,
    data: {
      adyen: {
        ...(transaction.adyen || {}),
        ...(eventCode ? { eventCode } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(pspReference ? { pspReference } : {}),
        ...(resultCode ? { resultCode } : {}),
        ...(sessionResult ? { sessionResult } : {}),
        ...(sessionID ? { sessionID } : {}),
      },
      order: order.id,
      status: 'succeeded',
    },
    req,
  })

  if (decrementInventory) {
    await decrementInventoryForItems({
      items: transaction.items,
      productsSlug,
      req,
      variantsSlug,
    })
  }

  return {
    created: true,
    message: 'Order confirmed successfully',
    orderID: order.id,
    ...(order.accessToken
      ? {
          accessToken: order.accessToken,
        }
      : {}),
    transactionID: transaction.id,
  }
}
