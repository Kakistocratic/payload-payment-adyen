import type { Metadata } from 'next'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import React, { Fragment } from 'react'

import { CheckoutPage } from '@/components/checkout/CheckoutPage'

export default function Checkout() {
  return (
    <div className="container min-h-[90vh] flex">
      {!process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY && (
        <div>
          <Fragment>
            {'To enable checkout, you must '}
            <a
              href="https://docs.adyen.com/development-resources/api-credentials/"
              rel="noopener noreferrer"
              target="_blank"
            >
              obtain your Adyen API credentials
            </a>
            {' then set them as environment variables. See the '}
            <a
              href="https://docs.adyen.com/online-payments/build-your-integration/sessions-flow/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Adyen Sessions flow docs
            </a>
            {' for more details.'}
          </Fragment>
        </div>
      )}

      <h1 className="sr-only">Checkout</h1>

      <CheckoutPage />
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Checkout.',
  openGraph: mergeOpenGraph({
    title: 'Checkout',
    url: '/checkout',
  }),
  title: 'Checkout',
}
