import type {
  PaymentAdapterArgs,
  PaymentAdapterClientArgs,
} from '@payloadcms/plugin-ecommerce/types'
import type { PayloadRequest } from 'payload'

export type AdyenEnvironment = 'live' | 'test'

export type AdyenAdapterArgs = {
  apiKey: string
  apiVersion?: string
  clientKey: string
  environment?: AdyenEnvironment
  hmacKey?: string
  liveEndpointUrlPrefix?: string
  merchantAccount: string
  returnURL?: string
  shopperLocale?: string
  webhooks?: AdyenWebhookHandlers
} & PaymentAdapterArgs

export type AdyenAdapterClientArgs = {
  clientKey: string
  environment?: AdyenEnvironment
} & PaymentAdapterClientArgs

export type AdyenAmount = {
  currency: string
  value: number
}

export type AdyenSessionResponse = {
  id: string
  sessionData: string
  amount?: AdyenAmount
  countryCode?: string
  expiresAt?: string
  merchantAccount?: string
  reference?: string
  returnUrl?: string
}

export type AdyenNotificationRequestItem = {
  additionalData?: {
    hmacSignature?: string
    [key: string]: unknown
  }
  amount?: AdyenAmount
  eventCode?: string
  eventDate?: string
  merchantAccountCode?: string
  merchantReference?: string
  operations?: string[]
  originalReference?: string
  paymentMethod?: string
  pspReference?: string
  reason?: string
  success?: string
}

export type AdyenWebhookHandler = (args: {
  notification: AdyenNotificationRequestItem
  req: PayloadRequest
}) => Promise<void> | void

export type AdyenWebhookHandlers = {
  [eventCode: string]: AdyenWebhookHandler
}
