import type { Endpoint } from 'payload'

const failedResultCodes = new Set(['Cancelled', 'Error', 'Refused'])

type AdyenOutcomeBody = {
  paymentMethod?: string
  pspReference?: string
  resultCode?: string
  sessionID?: string
}

export const outcomeEndpoint = (): Endpoint => {
  return {
    handler: async (req) => {
      try {
        const data = (await req.json?.()) as AdyenOutcomeBody | undefined
        const sessionID = data?.sessionID
        const resultCode = data?.resultCode

        if (!sessionID || typeof sessionID !== 'string') {
          return Response.json(
            {
              message: 'Adyen session ID is required.',
            },
            {
              status: 400,
            },
          )
        }

        if (!resultCode || typeof resultCode !== 'string') {
          return Response.json(
            {
              message: 'Adyen resultCode is required.',
            },
            {
              status: 400,
            },
          )
        }

        const transactions = await (req.payload as any).find({
          collection: 'transactions',
          req,
          where: {
            'adyen.sessionID': {
              equals: sessionID,
            },
          },
        })

        const transaction = transactions.docs?.[0]

        if (!transaction) {
          return Response.json(
            {
              message: 'No transaction found for the provided Adyen session ID.',
            },
            {
              status: 404,
            },
          )
        }

        const status = failedResultCodes.has(resultCode) ? 'failed' : 'pending'

        await (req.payload as any).update({
          id: transaction.id,
          collection: 'transactions',
          data: {
            adyen: {
              ...(transaction.adyen || {}),
              paymentMethod: data?.paymentMethod,
              pspReference: data?.pspReference,
              resultCode,
            },
            status,
          },
          req,
        })

        return Response.json({
          message: 'Payment outcome recorded',
          status,
        })
      } catch (error) {
        req.payload.logger.error({
          err: error,
          msg: 'Error recording Adyen payment outcome',
        })

        return Response.json(
          {
            message: 'Error recording Adyen payment outcome.',
          },
          {
            status: 500,
          },
        )
      }
    },
    method: 'post',
    path: '/outcome',
  }
}

