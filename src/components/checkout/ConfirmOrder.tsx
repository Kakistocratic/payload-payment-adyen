'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Message } from '@/components/Message'
import { useCart, usePayments } from '@payloadcms/plugin-ecommerce/client/react'
import { AdyenCheckout } from '@adyen/adyen-web/auto'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getStoredAdyenCheckoutContext,
  removeStoredAdyenCheckoutContext,
} from '@/plugins/adyen/client/checkoutContext'

type PaymentResult = {
  paymentMethod?: string
  pspReference?: string
  resultCode?: string
  sessionResult?: string
}

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

  const recordAdyenOutcome = useCallback(async (sessionID: string, result?: PaymentResult) => {
    if (!result?.resultCode) {
      return
    }

    await fetch('/api/payments/adyen/outcome', {
      body: JSON.stringify({
        paymentMethod: result.paymentMethod,
        pspReference: result.pspReference,
        resultCode: result.resultCode,
        sessionID,
        sessionResult: result.sessionResult,
      }),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  }, [])

  useEffect(() => {
    if (!cart || !cart.items || cart.items?.length === 0) {
      return
    }

    const adyenSessionID = searchParams.get('sessionId')
    const redirectResult = searchParams.get('redirectResult')
    const paymentIntentID = searchParams.get('payment_intent')
    const email = searchParams.get('email')

    if (adyenSessionID && redirectResult) {
      if (!isConfirming.current) {
        isConfirming.current = true

        const storedContext = getStoredAdyenCheckoutContext(adyenSessionID)

        void AdyenCheckout({
          clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY || '',
          environment: process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test',
          locale:
            storedContext?.locale ||
            (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'),
          onError: () => {
            setError('Payment confirmation failed. Try again or contact support.')
          },
          onPaymentCompleted: (result: PaymentResult) => {
            void confirmOrder('adyen', {
              additionalData: {
                ...(storedContext?.customerEmail
                  ? {
                      customerEmail: storedContext.customerEmail,
                    }
                  : {}),
                pspReference: result.pspReference,
                resultCode: result.resultCode,
                sessionID: adyenSessionID,
                sessionResult: result.sessionResult,
                ...(storedContext?.shippingAddress
                  ? {
                      shippingAddress: storedContext.shippingAddress,
                    }
                  : {}),
              },
            })
              .then((result) => {
                if (result && typeof result === 'object') {
                  removeStoredAdyenCheckoutContext(adyenSessionID)
                  redirectToOrder(result, storedContext?.customerEmail)
                }
              })
              .catch((error) => {
                setError(error instanceof Error ? error.message : 'Payment confirmation failed.')
              })
          },
          onPaymentFailed: (result?: PaymentResult) => {
            void recordAdyenOutcome(adyenSessionID, result).finally(() => {
              setError(
                result?.resultCode
                  ? `Payment was not completed. Result code: ${result.resultCode}`
                  : 'Payment was not completed.',
              )
            })
          },
          session: {
            id: adyenSessionID,
          },
        } as never)
          .then((checkout) => {
            checkout.submitDetails({
              details: {
                redirectResult,
              },
            })
          })
          .catch((error) => {
            setError(error instanceof Error ? error.message : 'Payment confirmation failed.')
          })
      }
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
  }, [cart, confirmOrder, recordAdyenOutcome, redirectToOrder, router, searchParams])

  return (
    <div className="text-center w-full flex flex-col items-center justify-start gap-4">
      <h1 className="text-2xl">Confirming Order</h1>

      {error && <Message error={error} />}
      <LoadingSpinner className="w-12 h-6" />
    </div>
  )
}
