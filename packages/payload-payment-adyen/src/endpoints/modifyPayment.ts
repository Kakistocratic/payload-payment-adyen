import type { Endpoint, PayloadRequest } from 'payload'

import type { AdyenAdapterArgs, AdyenAmount } from '../types'
import { getAdyenPaymentModificationURL } from '../utilities'

type ModificationOperation = 'cancel' | 'capture' | 'refund'

type ModifyPaymentBody = {
  amount?: AdyenAmount
  merchantRefundReason?: 'CUSTOMER REQUEST' | 'DUPLICATE' | 'FRAUD' | 'OTHER' | 'RETURN'
  reference?: string
}

type AdyenModificationResponse = {
  paymentPspReference?: string
  pspReference?: string
  reference?: string
  status?: string
}

const operationToAdyenPath: Record<ModificationOperation, 'cancels' | 'captures' | 'refunds'> = {
  cancel: 'cancels',
  capture: 'captures',
  refund: 'refunds',
}

const operationToReferencePrefix: Record<ModificationOperation, string> = {
  cancel: 'cancel',
  capture: 'capture',
  refund: 'refund',
}

const operationToPspField: Record<ModificationOperation, string> = {
  cancel: 'cancelPspReference',
  capture: 'capturePspReference',
  refund: 'refundPspReference',
}

const isAdminUser = (user: PayloadRequest['user']) => {
  return Boolean(
    user &&
      typeof user === 'object' &&
      Array.isArray((user as { roles?: unknown }).roles) &&
      (user as { roles: unknown[] }).roles.includes('admin'),
  )
}

const getRouteParam = (req: PayloadRequest, key: string) => {
  const value = req.routeParams?.[key]

  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

const getModificationAmount = ({
  body,
  operation,
  transaction,
}: {
  body?: ModifyPaymentBody
  operation: ModificationOperation
  transaction: Record<string, any>
}) => {
  if (operation === 'cancel') {
    return undefined
  }

  if (body?.amount) {
    return body.amount
  }

  return {
    currency: transaction.currency,
    value: transaction.amount,
  }
}

const makeModificationRequest = async ({
  body,
  operation,
  props,
  transaction,
}: {
  body?: ModifyPaymentBody
  operation: ModificationOperation
  props: AdyenAdapterArgs
  transaction: Record<string, any>
}) => {
  const paymentPspReference = transaction.adyen?.pspReference

  if (!paymentPspReference || typeof paymentPspReference !== 'string') {
    throw new Error('Adyen PSP reference is required before modifying a payment.')
  }

  const reference =
    body?.reference ||
    `${operationToReferencePrefix[operation]}-${transaction.id}-${crypto.randomUUID()}`
  const amount = getModificationAmount({
    body,
    operation,
    transaction,
  })

  const requestBody = {
    ...(amount ? { amount } : {}),
    merchantAccount: props.merchantAccount,
    ...(body?.merchantRefundReason && operation === 'refund'
      ? { merchantRefundReason: body.merchantRefundReason }
      : {}),
    reference,
  }

  const response = await fetch(
    getAdyenPaymentModificationURL(
      props,
      paymentPspReference,
      operationToAdyenPath[operation],
    ),
    {
      body: JSON.stringify(requestBody),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': reference,
        'x-api-key': props.apiKey,
      },
      method: 'POST',
    },
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Adyen ${operation} request failed with ${response.status}: ${errorBody}`)
  }

  return (await response.json()) as AdyenModificationResponse
}

export const modifyPaymentEndpoint = (
  props: AdyenAdapterArgs,
  operation: ModificationOperation,
): Endpoint => {
  return {
    handler: async (req) => {
      if (!isAdminUser(req.user)) {
        return Response.json(
          {
            message: 'Admin access is required to modify Adyen payments.',
          },
          {
            status: 403,
          },
        )
      }

      const transactionID = getRouteParam(req, 'transactionID')

      if (!transactionID) {
        return Response.json(
          {
            message: 'Transaction ID is required.',
          },
          {
            status: 400,
          },
        )
      }

      try {
        let body: ModifyPaymentBody | undefined

        try {
          body = (await req.json?.()) as ModifyPaymentBody | undefined
        } catch {
          body = undefined
        }

        const transaction = (await (req.payload as any).findByID({
          id: transactionID,
          collection: 'transactions',
          req,
        })) as Record<string, any> | null

        if (!transaction) {
          return Response.json(
            {
              message: 'Transaction not found.',
            },
            {
              status: 404,
            },
          )
        }

        if (transaction.paymentMethod !== 'adyen') {
          return Response.json(
            {
              message: 'Transaction is not an Adyen transaction.',
            },
            {
              status: 400,
            },
          )
        }

        const adyenResponse = await makeModificationRequest({
          body,
          operation,
          props,
          transaction,
        })

        await (req.payload as any).update({
          id: transaction.id,
          collection: 'transactions',
          data: {
            adyen: {
              ...(transaction.adyen || {}),
              [operationToPspField[operation]]: adyenResponse.pspReference,
              modificationStatus: adyenResponse.status || 'received',
            },
          },
          req,
        })

        return Response.json({
          message: `Adyen ${operation} request submitted.`,
          operation,
          ...adyenResponse,
        })
      } catch (error) {
        req.payload.logger.error({
          err: error,
          msg: `Error submitting Adyen ${operation} request`,
          transactionID,
        })

        return Response.json(
          {
            message:
              error instanceof Error
                ? error.message
                : `Unknown error submitting Adyen ${operation} request.`,
          },
          {
            status: 500,
          },
        )
      }
    },
    method: 'post',
    path: `/transactions/:transactionID/${operation}`,
  }
}
