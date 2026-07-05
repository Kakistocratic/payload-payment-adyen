import type { Endpoint } from 'payload'

import type { AdyenAdapterArgs, AdyenNotificationRequestItem } from '../types'
import { validateStandardNotificationHMAC } from '../utilities'

type AdyenWebhookBody = {
  notificationItems?: Array<{
    NotificationRequestItem?: AdyenNotificationRequestItem
  }>
}

const getStatusFromNotification = (notification: AdyenNotificationRequestItem) => {
  if (notification.eventCode !== 'AUTHORISATION') {
    return undefined
  }

  return notification.success === 'true' ? 'succeeded' : 'failed'
}

const reconcileTransaction = async ({
  notification,
  req,
}: {
  notification: AdyenNotificationRequestItem
  req: Parameters<Endpoint['handler']>[0]
}) => {
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
  ]

  if (or.length === 0) {
    return
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
    return
  }

  const status = getStatusFromNotification(notification)

  await (req.payload as any).update({
    id: transaction.id,
    collection: 'transactions',
    data: {
      adyen: {
        ...(transaction.adyen || {}),
        eventCode: notification.eventCode,
        paymentMethod: notification.paymentMethod,
        pspReference: notification.pspReference,
        ...(checkoutSessionID ? { sessionID: checkoutSessionID } : {}),
      },
      ...(status ? { status } : {}),
    },
    req,
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

          await reconcileTransaction({
            notification,
            req,
          })

          if (handler) {
            await handler({
              notification,
              req,
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
