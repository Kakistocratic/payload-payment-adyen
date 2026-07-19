import type { Endpoint } from 'payload'

import { completeAdyenOrder } from '../completeOrder'
import type { AdyenAdapterArgs, AdyenNotificationRequestItem } from '../types'
import { validateStandardNotificationHMAC } from '../utilities'

type AdyenWebhookBody = {
  notificationItems?: Array<{
    NotificationRequestItem?: AdyenNotificationRequestItem
  }>
}

type EndpointRequest = Parameters<Endpoint['handler']>[0]

type FindTransactionResult = {
  checkoutSessionID?: string
  merchantReference?: string
  transaction?: Record<string, any>
}

const getStatusFromNotification = (notification: AdyenNotificationRequestItem) => {
  if (notification.eventCode === 'AUTHORISATION') {
    return notification.success === 'true' ? 'succeeded' : 'failed'
  }

  if (
    (notification.eventCode === 'CANCELLATION' || notification.eventCode === 'TECHNICAL_CANCEL') &&
    notification.success === 'true'
  ) {
    return 'cancelled'
  }

  if (notification.eventCode === 'REFUND' && notification.success === 'true') {
    return 'refunded'
  }

  return undefined
}

const getWebhookEventKey = (notification: AdyenNotificationRequestItem) => {
  if (!notification.eventCode || !notification.pspReference) {
    return undefined
  }

  return `${notification.eventCode}:${notification.pspReference}`
}

const getProcessedWebhookEvents = (transaction?: Record<string, any>) => {
  const webhookEvents = transaction?.adyen?.webhookEvents

  return Array.isArray(webhookEvents) ? webhookEvents : []
}

const hasProcessedWebhookEvent = ({
  eventKey,
  transaction,
}: {
  eventKey?: string
  transaction?: Record<string, any>
}) => {
  if (!eventKey) {
    return false
  }

  return getProcessedWebhookEvents(transaction).some((event) => event?.key === eventKey)
}

const getWebhookEventRecord = ({
  eventKey,
  notification,
}: {
  eventKey: string
  notification: AdyenNotificationRequestItem
}) => {
  return {
    eventCode: notification.eventCode,
    key: eventKey,
    originalReference: notification.originalReference,
    processedAt: new Date().toISOString(),
    pspReference: notification.pspReference,
    success: notification.success,
  }
}

const getModificationPspField = (eventCode?: string) => {
  if (eventCode === 'CAPTURE' || eventCode === 'CAPTURE_FAILED') {
    return 'capturePspReference'
  }

  if (eventCode === 'REFUND' || eventCode === 'REFUND_FAILED' || eventCode === 'REFUNDED_REVERSED') {
    return 'refundPspReference'
  }

  if (eventCode === 'CANCELLATION' || eventCode === 'TECHNICAL_CANCEL') {
    return 'cancelPspReference'
  }

  return undefined
}

const updateRelatedOrderStatus = async ({
  req,
  status,
  transaction,
}: {
  req: EndpointRequest
  status?: string
  transaction: Record<string, any>
}) => {
  if ((status !== 'cancelled' && status !== 'refunded') || !transaction.order) {
    return
  }

  const orderID =
    typeof transaction.order === 'object' && transaction.order ? transaction.order.id : transaction.order

  if (!orderID) {
    return
  }

  await (req.payload as any).update({
    id: orderID,
    collection: 'orders',
    data: {
      status,
    },
    req,
  })
}

const findTransactionForNotification = async ({
  notification,
  req,
}: {
  notification: AdyenNotificationRequestItem
  req: EndpointRequest
}): Promise<FindTransactionResult> => {
  const merchantReference = notification.merchantReference
  const checkoutSessionID =
    typeof notification.additionalData?.checkoutSessionId === 'string'
      ? notification.additionalData.checkoutSessionId
      : undefined

  const or = [
    ...(merchantReference
      ? [
          {
            'adyen.merchantReference': {
              equals: merchantReference,
            },
          },
        ]
      : []),
    ...(checkoutSessionID
      ? [
          {
            'adyen.sessionID': {
              equals: checkoutSessionID,
            },
          },
        ]
      : []),
    ...(notification.originalReference
      ? [
          {
            'adyen.pspReference': {
              equals: notification.originalReference,
            },
          },
        ]
      : []),
    ...(notification.pspReference
      ? [
          {
            'adyen.pspReference': {
              equals: notification.pspReference,
            },
          },
        ]
      : []),
  ]

  if (or.length === 0) {
    return {
      checkoutSessionID,
      merchantReference,
    }
  }

  const transactions = await (req.payload as any).find({
    collection: 'transactions',
    limit: 1,
    req,
    where: {
      or,
    },
  })

  const transaction = transactions.docs?.[0]

  if (!transaction) {
    req.payload.logger.warn({
      checkoutSessionID,
      eventCode: notification.eventCode,
      merchantReference,
      msg: 'No transaction found for Adyen webhook',
      pspReference: notification.pspReference,
    })
  }

  return {
    checkoutSessionID,
    merchantReference,
    transaction,
  }
}

const markWebhookEventProcessed = async ({
  eventKey,
  notification,
  req,
  transaction,
}: {
  eventKey: string
  notification: AdyenNotificationRequestItem
  req: EndpointRequest
  transaction: Record<string, any>
}) => {
  const currentTransaction = (await (req.payload as any).findByID({
    id: transaction.id,
    collection: 'transactions',
    depth: 0,
    req,
  })) as Record<string, any> | null

  const resolvedTransaction = currentTransaction || transaction

  if (hasProcessedWebhookEvent({ eventKey, transaction: resolvedTransaction })) {
    return
  }

  await (req.payload as any).update({
    id: transaction.id,
    collection: 'transactions',
    data: {
      adyen: {
        ...(resolvedTransaction.adyen || {}),
        webhookEvents: [
          ...getProcessedWebhookEvents(resolvedTransaction),
          getWebhookEventRecord({
            eventKey,
            notification,
          }),
        ],
      },
    },
    req,
  })
}

const reconcileTransaction = async ({
  checkoutSessionID,
  notification,
  req,
  transaction,
}: {
  checkoutSessionID?: string
  notification: AdyenNotificationRequestItem
  req: EndpointRequest
  transaction: Record<string, any>
}) => {
  const status = getStatusFromNotification(notification)
  const modificationPspField = getModificationPspField(notification.eventCode)

  if (status === 'succeeded') {
    await completeAdyenOrder({
      decrementInventory: true,
      eventCode: notification.eventCode,
      paymentMethod: notification.paymentMethod,
      pspReference: notification.pspReference,
      req,
      resultCode: 'Authorised',
      ...(checkoutSessionID ? { sessionID: checkoutSessionID } : {}),
      transaction,
    })

    return
  }

  await (req.payload as any).update({
    id: transaction.id,
    collection: 'transactions',
    data: {
      adyen: {
        ...(transaction.adyen || {}),
        eventCode: notification.eventCode,
        ...(notification.originalReference
          ? { originalReference: notification.originalReference }
          : {}),
        paymentMethod: notification.paymentMethod,
        ...(notification.eventCode === 'AUTHORISATION'
          ? { pspReference: notification.pspReference }
          : {}),
        ...(modificationPspField ? { [modificationPspField]: notification.pspReference } : {}),
        ...(notification.eventCode && notification.eventCode !== 'AUTHORISATION'
          ? {
              modificationReason: notification.reason,
              modificationStatus: notification.success === 'true' ? 'succeeded' : 'failed',
            }
          : {}),
        ...(status === 'failed' ? { resultCode: 'Refused' } : {}),
        ...(checkoutSessionID ? { sessionID: checkoutSessionID } : {}),
      },
      ...(status ? { status } : {}),
    },
    req,
  })

  await updateRelatedOrderStatus({
    req,
    status,
    transaction,
  })
}

export const webhooksEndpoint = ({
  hmacKey,
  webhooks,
}: Pick<AdyenAdapterArgs, 'hmacKey' | 'webhooks'>): Endpoint => {
  return {
    handler: async (req) => {
      let returnStatus = 200

      try {
        const body = (await req.json?.()) as AdyenWebhookBody | undefined
        const notificationItems = body?.notificationItems || []

        for (const item of notificationItems) {
          const notification = item.NotificationRequestItem

          if (!notification) {
            continue
          }

          if (
            hmacKey &&
            !validateStandardNotificationHMAC({
              hmacKey,
              notification,
            })
          ) {
            req.payload.logger.error({
              eventCode: notification.eventCode,
              merchantReference: notification.merchantReference,
              msg: 'Invalid Adyen webhook HMAC signature',
              pspReference: notification.pspReference,
            })
            returnStatus = 401
            continue
          }

          const handler = notification.eventCode ? webhooks?.[notification.eventCode] : undefined
          const eventKey = getWebhookEventKey(notification)
          const { checkoutSessionID, transaction } = await findTransactionForNotification({
            notification,
            req,
          })

          if (hasProcessedWebhookEvent({ eventKey, transaction })) {
            req.payload.logger.info({
              eventCode: notification.eventCode,
              msg: 'Skipping duplicate Adyen webhook event',
              pspReference: notification.pspReference,
            })
            continue
          }

          if (transaction) {
            await reconcileTransaction({
              checkoutSessionID,
              notification,
              req,
              transaction,
            })
          }

          if (handler) {
            await handler({
              notification,
              req,
            })
          }

          if (eventKey && transaction) {
            await markWebhookEventProcessed({
              eventKey,
              notification,
              req,
              transaction,
            })
          }
        }
      } catch (error) {
        req.payload.logger.error({
          err: error,
          msg: 'Error handling Adyen webhook',
        })
        returnStatus = 400
      }

      return new Response('[accepted]', {
        headers: {
          'content-type': 'text/plain',
        },
        status: returnStatus,
      })
    },
    method: 'post',
    path: '/webhooks',
  }
}
