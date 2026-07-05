'use client'

import { Message } from '@/components/Message'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { Address } from '@/payload-types'
import { useCart, usePayments } from '@payloadcms/plugin-ecommerce/client/react'
import { AdyenCheckout, Dropin } from '@adyen/adyen-web/auto'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useRef, useState } from 'react'

type AdyenPaymentData = {
  id: string
  merchantReference?: string
  sessionData: string
}

type Props = {
  billingAddress?: Partial<Address>
  customerEmail?: string
  paymentData: AdyenPaymentData
  setProcessingPayment: React.Dispatch<React.SetStateAction<boolean>>
  shippingAddress?: Partial<Address>
}

type AdyenPaymentResult = {
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
  paymentData,
  setProcessingPayment,
  shippingAddress,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const dropinRef = useRef<{ unmount?: () => void } | null>(null)
  const hasMounted = useRef(false)
  const [error, setError] = useState<null | string>(null)
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

        const queryString = queryParams.toString()
        router.push(`/orders/${confirmResult.orderID}${queryString ? `?${queryString}` : ''}`)
        return
      }

      throw new Error('Order confirmation did not return an order ID.')
    },
    [clearCart, confirmOrder, customerEmail, paymentData.id, router, setProcessingPayment, shippingAddress],
  )

  useEffect(() => {
    let isCancelled = false

    const mountDropin = async () => {
      if (!containerRef.current || hasMounted.current) {
        return
      }

      hasMounted.current = true
      setError(null)
      setIsLoading(true)

      try {
        const checkout = await AdyenCheckout({
          clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY || '',
          countryCode: billingAddress?.country || 'US',
          environment: process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test',
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
            setError(
              result?.resultCode
                ? `Payment was not completed. Result code: ${result.resultCode}`
                : 'Payment was not completed.',
            )
            setIsLoading(false)
            setProcessingPayment(false)
          },
          session: {
            id: paymentData.id,
            sessionData: paymentData.sessionData,
          },
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
    paymentData.id,
    paymentData.sessionData,
    setProcessingPayment,
  ])

  return (
    <div>
      {error && <Message error={error} />}
      {isLoading && (
        <div className="my-8">
          <LoadingSpinner />
        </div>
      )}
      <div ref={containerRef} />
    </div>
  )
}
