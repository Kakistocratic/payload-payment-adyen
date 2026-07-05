'use client'

import { Message } from '@/components/Message'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { Address } from '@/payload-types'
import { useCart, usePayments } from '@payloadcms/plugin-ecommerce/client/react'
import { AdyenCheckout, Dropin } from '@adyen/adyen-web/auto'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  removeStoredAdyenCheckoutContext,
  storeAdyenCheckoutContext,
} from '@/plugins/adyen/client/checkoutContext'

type AdyenPaymentData = {
  amount?: {
    currency: string
    value: number
  }
  countryCode?: string
  id: string
  locale?: string
  merchantReference?: string
  sessionData: string
}

type Props = {
  billingAddress?: Partial<Address>
  customerEmail?: string
  locale?: string
  paymentData: AdyenPaymentData
  setProcessingPayment: React.Dispatch<React.SetStateAction<boolean>>
  shippingAddress?: Partial<Address>
  translations?: Record<string, Record<string, string>>
}

type AdyenPaymentResult = {
  paymentMethod?: string
  resultCode?: string
  sessionResult?: string
  pspReference?: string
}

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export const AdyenCheckoutForm: React.FC<Props> = ({
  billingAddress,
  customerEmail,
  locale: localeFromProps,
  paymentData,
  setProcessingPayment,
  shippingAddress,
  translations,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const dropinRef = useRef<{ unmount?: () => void } | null>(null)
  const hasMounted = useRef(false)
  const [error, setError] = useState<null | string>(null)
  const [message, setMessage] = useState<null | string>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const { clearCart } = useCart()
  const { confirmOrder } = usePayments()

  const handleConfirmedOrder = useCallback(
    async (result: AdyenPaymentResult) => {
      setProcessingPayment(true)

      const confirmResult = await confirmOrder('adyen', {
        additionalData: {
          ...(customerEmail ? { customerEmail } : {}),
          resultCode: result.resultCode,
          sessionResult: result.sessionResult,
          sessionID: paymentData.id,
          ...(result.pspReference ? { pspReference: result.pspReference } : {}),
          ...(shippingAddress ? { shippingAddress } : {}),
        },
      })

      if (
        confirmResult &&
        typeof confirmResult === 'object' &&
        'orderID' in confirmResult &&
        confirmResult.orderID
      ) {
        const accessToken =
          'accessToken' in confirmResult ? (confirmResult.accessToken as string) : ''
        const queryParams = new URLSearchParams()

        if (customerEmail) {
          queryParams.set('email', customerEmail)
        }
        if (accessToken) {
          queryParams.set('accessToken', accessToken)
        }

        clearCart()
        removeStoredAdyenCheckoutContext(paymentData.id)

        const queryString = queryParams.toString()
        router.push(`/orders/${confirmResult.orderID}${queryString ? `?${queryString}` : ''}`)
        return
      }

      throw new Error('Order confirmation did not return an order ID.')
    },
    [clearCart, confirmOrder, customerEmail, paymentData.id, router, setProcessingPayment, shippingAddress],
  )

  const recordPaymentOutcome = useCallback(
    async (result?: AdyenPaymentResult) => {
      if (!result?.resultCode) {
        return
      }

      await fetch('/api/payments/adyen/outcome', {
        body: JSON.stringify({
          paymentMethod: result.paymentMethod,
          pspReference: result.pspReference,
          resultCode: result.resultCode,
          sessionResult: result.sessionResult,
          sessionID: paymentData.id,
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
    },
    [paymentData.id],
  )

  useEffect(() => {
    let isCancelled = false

    const mountDropin = async () => {
      if (!containerRef.current || hasMounted.current) {
        return
      }

      hasMounted.current = true
      setError(null)
      setMessage(null)
      setIsLoading(true)

      try {
        const locale =
          paymentData.locale ||
          localeFromProps ||
          (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US')

        storeAdyenCheckoutContext(paymentData.id, {
          ...(customerEmail ? { customerEmail } : {}),
          locale,
          ...(shippingAddress ? { shippingAddress } : {}),
        })

        const checkout = await AdyenCheckout({
          ...(paymentData.amount ? { amount: paymentData.amount } : {}),
          clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY || '',
          countryCode: paymentData.countryCode || billingAddress?.country || 'US',
          environment: process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test',
          locale,
          onError: (error) => {
            setError(
              error?.name === 'NETWORK_ERROR'
                ? 'Payment network error. Try again or use another payment method.'
                : 'Payment failed before it could be completed.',
            )
            setIsLoading(false)
            setProcessingPayment(false)
          },
          onPaymentCompleted: (result: AdyenPaymentResult) => {
            void handleConfirmedOrder(result).catch((error) => {
              setError(`Error while confirming order: ${getErrorMessage(error)}`)
              setIsLoading(false)
              setProcessingPayment(false)
            })
          },
          onPaymentFailed: (result?: AdyenPaymentResult) => {
            void recordPaymentOutcome(result).catch(() => {
              // Do not block shopper retry if recording the declined outcome fails.
            })

            setMessage(
              result?.resultCode === 'Refused'
                ? 'The payment was refused. Check the card details or try another payment method.'
                : result?.resultCode
                  ? `The payment was not completed. Result code: ${result.resultCode}`
                  : 'The payment was not completed.',
            )
            setIsLoading(false)
            setProcessingPayment(false)
          },
          session: {
            id: paymentData.id,
            sessionData: paymentData.sessionData,
          },
          ...(translations ? { translations } : {}),
        })

        if (isCancelled || !containerRef.current) {
          return
        }

        dropinRef.current = new Dropin(checkout, {
          paymentMethodsConfiguration: {
            card: {
              billingAddressRequired: false,
              hasHolderName: true,
              holderNameRequired: true,
            },
          },
        }).mount(containerRef.current)

        setIsLoading(false)
      } catch (error) {
        setError(`Error while loading payment form: ${getErrorMessage(error)}`)
        setIsLoading(false)
        setProcessingPayment(false)
      }
    }

    void mountDropin()

    return () => {
      isCancelled = true
      dropinRef.current?.unmount?.()
      dropinRef.current = null
      hasMounted.current = false
    }
  }, [
    billingAddress?.country,
    handleConfirmedOrder,
    customerEmail,
    localeFromProps,
    paymentData.amount,
    paymentData.countryCode,
    paymentData.id,
    paymentData.locale,
    paymentData.sessionData,
    recordPaymentOutcome,
    setProcessingPayment,
    shippingAddress,
    translations,
  ])

  return (
    <div>
      {error && <Message error={error} />}
      {message && <p className="mb-4 text-sm text-muted-foreground">{message}</p>}
      {isLoading && (
        <div className="my-8">
          <LoadingSpinner />
        </div>
      )}
      <div ref={containerRef} />
    </div>
  )
}
