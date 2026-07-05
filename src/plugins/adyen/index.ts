import type { GroupField } from 'payload'
import type { PaymentAdapter, PaymentAdapterClient } from '@payloadcms/plugin-ecommerce/types'

import { confirmOrder } from './confirmOrder'
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
      name: 'paymentMethod',
      type: 'text',
      label: 'Adyen Payment Method',
    },
    {
      name: 'eventCode',
      type: 'text',
      label: 'Adyen Webhook Event Code',
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
