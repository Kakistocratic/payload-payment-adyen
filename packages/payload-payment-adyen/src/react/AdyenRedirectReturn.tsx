'use client'

import { AdyenCheckout } from '@adyen/adyen-web/auto'
import { usePayments } from '@payloadcms/plugin-ecommerce/client/react'
import React, { useEffect, useRef, useState } from 'react'

import {
  getStoredAdyenCheckoutContext,
  removeStoredAdyenCheckoutContext,
} from './checkoutContext'
import type { AdyenPaymentResult } from './AdyenCheckoutForm'

export type AdyenRedirectReturnProps = {
  className?: string
  errorClassName?: string
  loadingFallback?: React.ReactNode
  onOrderConfirmed: (args: {
    accessToken?: string
    customerEmail?: string
    orderID: unknown
    result: unknown
  }) => void
  redirectResult: string
  sessionID: string
}

const getAccessToken = (result: object) => {
  return 'accessToken' in result ? (result.accessToken as string) : ''
}

export const AdyenRedirectReturn: React.FC<AdyenRedirectReturnProps> = ({
  className,
  errorClassName,
  loadingFallback = <p>Confirming payment...</p>,
  onOrderConfirmed,
  redirectResult,
  sessionID,
}) => {
  const { confirmOrder } = usePayments()
  const [error, setError] = useState<null | string>(null)
  const isConfirming = useRef(false)

  useEffect(() => {
    if (isConfirming.current) {
      return
    }

    isConfirming.current = true
    const storedContext = getStoredAdyenCheckoutContext(sessionID)

    const recordOutcome = async (result?: AdyenPaymentResult) => {
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
    }

    void AdyenCheckout({
      clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY || '',
      environment: process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test',
      locale:
        storedContext?.locale ||
        (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'),
      onError: () => {
        setError('Payment confirmation failed. Try again or contact support.')
      },
      onPaymentCompleted: (result: AdyenPaymentResult) => {
        void confirmOrder('adyen', {
          additionalData: {
            ...(storedContext?.customerEmail
              ? {
                  customerEmail: storedContext.customerEmail,
                }
              : {}),
            pspReference: result.pspReference,
            resultCode: result.resultCode,
            sessionID,
            sessionResult: result.sessionResult,
            ...(storedContext?.shippingAddress
              ? {
                  shippingAddress: storedContext.shippingAddress,
                }
              : {}),
          },
        })
          .then((confirmResult) => {
            if (confirmResult && typeof confirmResult === 'object' && 'orderID' in confirmResult) {
              removeStoredAdyenCheckoutContext(sessionID)
              const accessToken = getAccessToken(confirmResult)

              onOrderConfirmed({
                ...(accessToken ? { accessToken } : {}),
                customerEmail: storedContext?.customerEmail,
                orderID: confirmResult.orderID,
                result: confirmResult,
              })
            }
          })
          .catch((error) => {
            setError(error instanceof Error ? error.message : 'Payment confirmation failed.')
          })
      },
      onPaymentFailed: (result?: AdyenPaymentResult) => {
        void recordOutcome(result).finally(() => {
          setError(
            result?.resultCode
              ? `Payment was not completed. Result code: ${result.resultCode}`
              : 'Payment was not completed.',
          )
        })
      },
      session: {
        id: sessionID,
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
  }, [confirmOrder, onOrderConfirmed, redirectResult, sessionID])

  return (
    <div className={className}>
      {error && (
        <p className={errorClassName} role="alert">
          {error}
        </p>
      )}
      {!error && loadingFallback}
    </div>
  )
}
