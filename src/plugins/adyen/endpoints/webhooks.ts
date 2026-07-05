import type { Endpoint } from 'payload'

import type { AdyenAdapterArgs, AdyenNotificationRequestItem } from '../types'
import { validateStandardNotificationHMAC } from '../utilities'

type AdyenWebhookBody = {
  notificationItems?: Array<{
    NotificationRequestItem?: AdyenNotificationRequestItem
  }>
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

