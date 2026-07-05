import type { PaymentAdapterClient } from '@payloadcms/plugin-ecommerce/types'

import type { AdyenAdapterClientArgs } from './types'

export const adyenAdapterClient = (props: AdyenAdapterClientArgs): PaymentAdapterClient => {
  return {
    name: 'adyen',
    confirmOrder: true,
    initiatePayment: true,
    label: props.label || 'Adyen',
  }
}

export type { AdyenAdapterClientArgs } from './types'
