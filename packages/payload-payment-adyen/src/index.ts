import type { GroupField } from 'payload'
import type { PaymentAdapter, PaymentAdapterClient } from '@payloadcms/plugin-ecommerce/types'

import { confirmOrder } from './confirmOrder'
import { modifyPaymentEndpoint } from './endpoints/modifyPayment'
import { outcomeEndpoint } from './endpoints/outcome'
import { webhooksEndpoint } from './endpoints/webhooks'
import { initiatePayment } from './initiatePayment'
import type { AdyenAdapterArgs, AdyenAdapterClientArgs } from './types'

export const adyenAdapter = (props: AdyenAdapterArgs): PaymentAdapter => {
  const { groupOverrides } = props
  const label = props.label || 'Adyen'

  const baseFields: GroupField['fields'] = [
    {
      name: 'sessionID',
      type: 'text',
      label: 'Adyen Session ID',
    },
    {
      name: 'merchantReference',
      type: 'text',
      label: 'Adyen Merchant Reference',
    },
    {
      name: 'pspReference',
      type: 'text',
      label: 'Adyen PSP Reference',
    },
    {
      name: 'resultCode',
      type: 'text',
      label: 'Adyen Result Code',
    },
    {
      name: 'sessionResult',
      type: 'text',
      label: 'Adyen Session Result',
    },
    {
      name: 'shopperLocale',
      type: 'text',
      label: 'Adyen Shopper Locale',
    },
    {
      name: 'shippingAddress',
      type: 'json',
      label: 'Adyen Checkout Shipping Address',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'paymentMethod',
      type: 'text',
      label: 'Adyen Payment Method',
    },
    {
      name: 'eventCode',
      type: 'text',
      label: 'Adyen Webhook Event Code',
    },
    {
      name: 'capturePspReference',
      type: 'text',
      label: 'Adyen Capture PSP Reference',
    },
    {
      name: 'refundPspReference',
      type: 'text',
      label: 'Adyen Refund PSP Reference',
    },
    {
      name: 'cancelPspReference',
      type: 'text',
      label: 'Adyen Cancel PSP Reference',
    },
    {
      name: 'originalReference',
      type: 'text',
      label: 'Adyen Original PSP Reference',
    },
    {
      name: 'modificationStatus',
      type: 'text',
      label: 'Adyen Modification Status',
    },
    {
      name: 'modificationReason',
      type: 'text',
      label: 'Adyen Modification Reason',
    },
    {
      name: 'webhookEvents',
      type: 'array',
      label: 'Adyen Processed Webhook Events',
      admin: {
        hidden: true,
      },
      fields: [
        {
          name: 'key',
          type: 'text',
          required: true,
        },
        {
          name: 'eventCode',
          type: 'text',
        },
        {
          name: 'pspReference',
          type: 'text',
        },
        {
          name: 'originalReference',
          type: 'text',
        },
        {
          name: 'success',
          type: 'text',
        },
        {
          name: 'processedAt',
          type: 'date',
        },
      ],
    },
  ]

  const group: GroupField = {
    name: 'adyen',
    type: 'group',
    ...groupOverrides,
    admin: {
      condition: (data) => data?.paymentMethod === 'adyen',
      ...groupOverrides?.admin,
    },
    fields:
      groupOverrides?.fields && typeof groupOverrides.fields === 'function'
        ? groupOverrides.fields({
            defaultFields: baseFields,
          })
        : baseFields,
  }

  return {
    name: 'adyen',
    confirmOrder: confirmOrder(props),
    endpoints: [
      outcomeEndpoint(),
      modifyPaymentEndpoint(props, 'capture'),
      modifyPaymentEndpoint(props, 'refund'),
      modifyPaymentEndpoint(props, 'cancel'),
      webhooksEndpoint({
        hmacKey: props.hmacKey,
        webhooks: props.webhooks,
      }),
    ],
    group,
    initiatePayment: initiatePayment(props),
    label,
  }
}

export const adyenAdapterClient = (props: AdyenAdapterClientArgs): PaymentAdapterClient => {
  return {
    name: 'adyen',
    confirmOrder: true,
    initiatePayment: true,
    label: props.label || 'Adyen',
  }
}

export type { AdyenAdapterArgs, AdyenAdapterClientArgs } from './types'
export { completeAdyenOrder } from './completeOrder'
export { modifyPaymentEndpoint } from './endpoints/modifyPayment'
export { outcomeEndpoint } from './endpoints/outcome'
export { webhooksEndpoint } from './endpoints/webhooks'
export type { AdyenNotificationRequestItem, AdyenWebhookHandler, AdyenWebhookHandlers } from './types'
