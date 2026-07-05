export type StoredAdyenCheckoutContext = {
  customerEmail?: string
  locale?: string
  shippingAddress?: unknown
}

const getStorageKey = (sessionID: string) => `adyen-checkout-context:${sessionID}`

export const getStoredAdyenCheckoutContext = (sessionID: string) => {
  if (typeof window === 'undefined') {
    return undefined
  }

  const value = window.sessionStorage.getItem(getStorageKey(sessionID))

  if (!value) {
    return undefined
  }

  try {
    return JSON.parse(value) as StoredAdyenCheckoutContext
  } catch {
    return undefined
  }
}

export const removeStoredAdyenCheckoutContext = (sessionID: string) => {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(getStorageKey(sessionID))
}

export const storeAdyenCheckoutContext = (
  sessionID: string,
  context: StoredAdyenCheckoutContext,
) => {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(getStorageKey(sessionID), JSON.stringify(context))
}

