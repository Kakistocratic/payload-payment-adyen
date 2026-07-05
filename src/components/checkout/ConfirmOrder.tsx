'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Message } from '@/components/Message'
import { useCart, usePayments } from '@payloadcms/plugin-ecommerce/client/react'
import { AdyenRedirectReturn } from 'payload-payment-adyen/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const getAccessToken = (result: object) => {
  return 'accessToken' in result ? (result.accessToken as string) : ''
}

export const ConfirmOrder: React.FC = () => {
  const { confirmOrder } = usePayments()
  const { cart } = useCart()
  const [error, setError] = useState<null | string>(null)

  const searchParams = useSearchParams()
  const router = useRouter()
  // Ensure we only confirm the order once, even if the component re-renders
  const isConfirming = useRef(false)

  const redirectToOrder = useCallback(
    (result: object, email?: string) => {
      if (!('orderID' in result) || !result.orderID) {
        throw new Error('Order confirmation did not return an order ID.')
      }

      const accessToken = getAccessToken(result)
      const queryParams = new URLSearchParams()

      if (email) {
        queryParams.set('email', email)
      }
      if (accessToken) {
        queryParams.set('accessToken', accessToken)
      }

      const queryString = queryParams.toString()
      router.push(`/orders/${result.orderID}${queryString ? `?${queryString}` : ''}`)
    },
    [router],
  )

  const adyenSessionID = searchParams.get('sessionId')
  const redirectResult = searchParams.get('redirectResult')

  useEffect(() => {
    if (!cart || !cart.items || cart.items?.length === 0) {
      return
    }

    const paymentIntentID = searchParams.get('payment_intent')
    const email = searchParams.get('email')

    if (adyenSessionID && redirectResult) {
      return
    }

    if (paymentIntentID) {
      if (!isConfirming.current) {
        isConfirming.current = true

        confirmOrder('stripe', {
          additionalData: {
            paymentIntentID,
          },
        }).then((result) => {
          if (result && typeof result === 'object' && 'orderID' in result && result.orderID) {
            redirectToOrder(result, email || undefined)
          }
        })
      }
    } else {
      // If no payment intent ID is found, redirect to the home
      router.push('/')
    }
  }, [adyenSessionID, cart, confirmOrder, redirectResult, redirectToOrder, router, searchParams])

  if (adyenSessionID && redirectResult) {
    return (
      <div className="text-center w-full flex flex-col items-center justify-start gap-4">
        <h1 className="text-2xl">Confirming Order</h1>
        <AdyenRedirectReturn
          errorClassName="text-destructive"
          loadingFallback={<LoadingSpinner className="w-12 h-6" />}
          onOrderConfirmed={({ customerEmail, result }) => {
            if (result && typeof result === 'object') {
              redirectToOrder(result, customerEmail)
            }
          }}
          redirectResult={redirectResult}
          sessionID={adyenSessionID}
        />
      </div>
    )
  }

  return (
    <div className="text-center w-full flex flex-col items-center justify-start gap-4">
      <h1 className="text-2xl">Confirming Order</h1>

      {error && <Message error={error} />}
      <LoadingSpinner className="w-12 h-6" />
    </div>
  )
}
