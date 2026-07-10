#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

type Options = {
  cwd: string
  dryRun: boolean
  force: boolean
  removeStripe: boolean
}

type Change = {
  file: string
  message: string
}

const adyenServerBlock = `adyenAdapter({
          apiKey: process.env.ADYEN_API_KEY!,
          clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY!,
          environment: process.env.ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test',
          forceRedirectThreeDS: process.env.ADYEN_FORCE_REDIRECT_3DS === 'true',
          hmacKey: process.env.ADYEN_HMAC_KEY,
          liveEndpointUrlPrefix: process.env.ADYEN_LIVE_ENDPOINT_URL_PREFIX,
          merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT!,
        }),`

const adyenClientBlock = `adyenAdapterClient({
                clientKey: process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY || '',
                environment: process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT === 'live' ? 'live' : 'test',
              }),`

const envLines = [
  'ADYEN_API_KEY=',
  'ADYEN_MERCHANT_ACCOUNT=',
  'ADYEN_ENVIRONMENT=test',
  'ADYEN_HMAC_KEY=',
  'ADYEN_LIVE_ENDPOINT_URL_PREFIX=',
  'ADYEN_FORCE_REDIRECT_3DS=false',
  'NEXT_PUBLIC_ADYEN_CLIENT_KEY=',
  'NEXT_PUBLIC_ADYEN_ENVIRONMENT=test',
  'NEXT_PUBLIC_SERVER_URL=http://localhost:3000',
]

const usage = `Usage:
  payload-payment-adyen migrate-starter [options]

Options:
  --cwd <path>       Target Payload Ecommerce Starter directory. Defaults to current directory.
  --dry-run          Show planned changes without writing files.
  --remove-stripe    Remove Stripe adapter calls and Stripe package dependencies.
  --force            Patch checkout files even when conservative starter markers are not detected.
  --help             Show this help.
`

const parseArgs = (argv: string[]): Options => {
  const args = [...argv]

  if (args[0] === 'migrate-starter') {
    args.shift()
  }

  const options: Options = {
    cwd: process.cwd(),
    dryRun: false,
    force: false,
    removeStripe: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      console.log(usage)
      process.exit(0)
    }

    if (arg === '--cwd') {
      const value = args[index + 1]

      if (!value) {
        throw new Error('--cwd requires a path.')
      }

      options.cwd = path.resolve(value)
      index += 1
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--force') {
      options.force = true
      continue
    }

    if (arg === '--remove-stripe') {
      options.removeStripe = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

const readText = async (file: string) => {
  return readFile(file, 'utf8')
}

const writeText = async ({ changes, content, dryRun, file, message }: {
  changes: Change[]
  content: string
  dryRun: boolean
  file: string
  message: string
}) => {
  changes.push({
    file,
    message,
  })

  if (!dryRun) {
    await writeFile(file, content)
  }
}

const ensureImport = (content: string, importLine: string, afterImportPattern?: RegExp) => {
  if (content.includes(importLine)) {
    return content
  }

  if (afterImportPattern?.test(content)) {
    return content.replace(afterImportPattern, (match) => `${match}\n${importLine}`)
  }

  return `${importLine}\n${content}`
}

const removeLineContaining = (content: string, value: string) => {
  return content
    .split(/\r?\n/)
    .filter((line) => !line.includes(value))
    .join('\n')
}

const patchServerAdapter = async (cwd: string, dryRun: boolean, removeStripe: boolean) => {
  const file = path.join(cwd, 'src', 'plugins', 'index.ts')
  const changes: Change[] = []
  let content = await readText(file)
  let next = ensureImport(
    content,
    "import { adyenAdapter } from 'payload-payment-adyen'",
    /import \{ stripeAdapter \} from '@payloadcms\/plugin-ecommerce\/payments\/stripe'/,
  )

  const stripeBlock =
    /[ \t]*stripeAdapter\(\{\r?\n[ \t]*secretKey: process\.env\.STRIPE_SECRET_KEY!,\r?\n[ \t]*publishableKey: process\.env\.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,\r?\n[ \t]*webhookSecret: process\.env\.STRIPE_WEBHOOKS_SIGNING_SECRET!,\r?\n[ \t]*\}\),?\r?\n?/m

  if (!next.includes('adyenAdapter({')) {
    if (!stripeBlock.test(next)) {
      throw new Error(`Could not find the known Stripe adapter block in ${file}. Apply the server adapter doc manually.`)
    }

    next = removeStripe
      ? next.replace(stripeBlock, `${' '.repeat(8)}${adyenServerBlock}\n`)
      : next.replace(stripeBlock, (match) => `${match}${' '.repeat(8)}${adyenServerBlock}\n`)
  } else if (removeStripe) {
    next = next.replace(stripeBlock, '')
  }

  if (removeStripe) {
    next = removeLineContaining(next, "@payloadcms/plugin-ecommerce/payments/stripe")
  }

  if (next !== content) {
    await writeText({
      changes,
      content: next,
      dryRun,
      file,
      message: 'Updated Payload Ecommerce server payment adapter configuration.',
    })
  }

  return changes
}

const patchClientProvider = async (cwd: string, dryRun: boolean, removeStripe: boolean) => {
  const file = path.join(cwd, 'src', 'providers', 'index.tsx')
  const changes: Change[] = []
  let content = await readText(file)
  let next = ensureImport(
    content,
    "import { adyenAdapterClient } from 'payload-payment-adyen/client'",
    /import \{ stripeAdapterClient \} from '@payloadcms\/plugin-ecommerce\/payments\/stripe'/,
  )

  const stripeBlock =
    /[ \t]*stripeAdapterClient\(\{\r?\n[ \t]*publishableKey: process\.env\.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \|\| '',\r?\n[ \t]*\}\),?\r?\n?/m

  if (!next.includes('adyenAdapterClient({')) {
    if (!stripeBlock.test(next)) {
      throw new Error(`Could not find the known Stripe client adapter block in ${file}. Apply the client provider doc manually.`)
    }

    next = removeStripe
      ? next.replace(stripeBlock, `${' '.repeat(14)}${adyenClientBlock}\n`)
      : next.replace(stripeBlock, (match) => `${match}${' '.repeat(14)}${adyenClientBlock}\n`)
  } else if (removeStripe) {
    next = next.replace(stripeBlock, '')
  }

  if (removeStripe) {
    next = removeLineContaining(next, "@payloadcms/plugin-ecommerce/payments/stripe")
  }

  if (next !== content) {
    await writeText({
      changes,
      content: next,
      dryRun,
      file,
      message: 'Updated client EcommerceProvider payment methods.',
    })
  }

  return changes
}

const getStorefrontLayout = (cwd: string) => {
  const candidates = [
    path.join(cwd, 'src', 'app', '(app)', 'layout.tsx'),
    path.join(cwd, 'src', 'app', '(frontend)', 'layout.tsx'),
    path.join(cwd, 'src', 'app', 'layout.tsx'),
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

const patchAdyenCSS = async (cwd: string, dryRun: boolean) => {
  const file = getStorefrontLayout(cwd)
  const changes: Change[] = []

  if (!file) {
    throw new Error('Could not find storefront layout. Add @adyen/adyen-web/styles/adyen.css manually.')
  }

  const content = await readText(file)

  if (content.includes("@adyen/adyen-web/styles/adyen.css")) {
    return changes
  }

  const next = content.includes("import './globals.css'")
    ? content.replace(
        "import './globals.css'",
        "import '@adyen/adyen-web/styles/adyen.css'\nimport './globals.css'",
      )
    : `${"import '@adyen/adyen-web/styles/adyen.css'"}\n${content}`

  await writeText({
    changes,
    content: next,
    dryRun,
    file,
    message: 'Imported Adyen Web CSS in the storefront layout.',
  })

  return changes
}

const patchEnvFile = async (file: string, dryRun: boolean) => {
  const changes: Change[] = []

  if (!existsSync(file)) {
    return changes
  }

  const content = await readText(file)
  const missing = envLines.filter((line) => {
    const key = line.split('=')[0]

    return key ? !new RegExp(`^${key}=`, 'm').test(content) : false
  })

  if (missing.length === 0) {
    return changes
  }

  const next = `${content.trimEnd()}\n\n# Adyen\n${missing.join('\n')}\n`

  await writeText({
    changes,
    content: next,
    dryRun,
    file,
    message: 'Added missing Adyen environment variables.',
  })

  return changes
}

const removeImportLine = (content: string, importPath: string) => {
  return content
    .split(/\r?\n/)
    .filter((line) => !line.includes(`from '${importPath}'`) && !line.includes(`from "${importPath}"`))
    .join('\n')
}

const removeUnusedThemeReferences = (content: string) => {
  let next = content

  if (!/\btheme\b/.test(next.replace(/const \{ theme \} = useTheme\(\)\r?\n/, ''))) {
    next = next.replace(/[ \t]*const \{ theme \} = useTheme\(\)\r?\n/, '')
    next = removeImportLine(next, '@/providers/Theme')
  }

  const withoutCssVariablesImport = removeImportLine(next, '@/cssVariables')

  if (!withoutCssVariablesImport.includes('cssVariables')) {
    next = withoutCssVariablesImport
  }

  return next
}

const patchCheckoutPage = async (cwd: string, dryRun: boolean, force: boolean) => {
  const changes: Change[] = []
  const file = path.join(cwd, 'src', 'components', 'checkout', 'CheckoutPage.tsx')

  if (!existsSync(file)) {
    return changes
  }

  const content = await readText(file)

  if (
    !force &&
    (content.includes('payload-payment-adyen/react') ||
      !content.includes('@stripe/react-stripe-js') ||
      !content.includes('<Elements'))
  ) {
    return changes
  }

  let next = content

  next = removeImportLine(next, '@stripe/react-stripe-js')
  next = removeImportLine(next, '@stripe/stripe-js')
  next = removeImportLine(next, '@/components/forms/CheckoutForm')
  next = ensureImport(
    next,
    "import { AdyenCheckoutForm, type AdyenPaymentData } from 'payload-payment-adyen/react'",
    /import React, \{ Suspense, useCallback, useEffect, useState \} from 'react'/,
  )

  next = next.replace(
    /\r?\nconst apiKey = `\$\{process\.env\.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\}`\r?\nconst stripe = loadStripe\(apiKey\)\r?\n/,
    '\n',
  )
  next = next.replace(
    'const [paymentData, setPaymentData] = useState<null | Record<string, unknown>>(null)',
    'const [paymentData, setPaymentData] = useState<AdyenPaymentData | null>(null)',
  )
  next = next.replace('async (paymentID: string) => {', 'async () => {')
  next = next.replace(
    /try \{\r?\n[ \t]*const paymentData = \(await initiatePayment\(paymentID, \{/,
    `try {
        setError(null)
        const shopperLocale =
          typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'
        const paymentData = (await initiatePayment('adyen', {`,
  )
  next = next.replace(
    /billingAddress,\r?\n[ \t]*shippingAddress: billingAddressSameAsShipping \? billingAddress : shippingAddress,/,
    `billingAddress,
            countryCode: billingAddress?.country,
            shippingAddress: billingAddressSameAsShipping ? billingAddress : shippingAddress,
            shopperLocale,`,
  )
  next = next.replace('})) as Record<string, unknown>', '})) as AdyenPaymentData')
  next = next.replace("void initiatePaymentIntent('stripe')", 'void initiatePaymentIntent()')
  next = next.replaceAll("paymentData?.['clientSecret']", "paymentData?.['sessionData']")

  const stripeElementsBlock =
    /<Elements[\s\S]*?stripe=\{stripe\}\r?\n[ \t]*>\r?\n([\s\S]*?)\r?\n[ \t]*<\/Elements>/

  if (!stripeElementsBlock.test(next)) {
    throw new Error(`Could not find the known Stripe Elements block in ${file}. Apply the checkout doc manually.`)
  }

  next = next.replace(
    stripeElementsBlock,
    `<div className="flex flex-col gap-8">
                  <AdyenCheckoutForm
                    billingAddress={billingAddress}
                    customerEmail={email}
                    paymentData={paymentData as AdyenPaymentData}
                    setProcessingPayment={setProcessingPayment}
                    shippingAddress={billingAddressSameAsShipping ? billingAddress : shippingAddress}
                  />
                  <Button
                    variant="ghost"
                    className="self-start"
                    onClick={() => setPaymentData(null)}
                  >
                    Cancel payment
                  </Button>
                </div>`,
  )
  next = next.replace(/\r?\n[ \t]*if \(!stripe\) return null\r?\n/, '\n')
  next = next.replace(/\r?\n[ \t]*\{\/\* @ts-ignore \*\/\}/, '')
  next = next.replace(
    '[billingAddress, billingAddressSameAsShipping, shippingAddress],',
    '[billingAddress, billingAddressSameAsShipping, email, initiatePayment, shippingAddress],',
  )
  next = removeUnusedThemeReferences(next)

  if (next !== content) {
    await writeText({
      changes,
      content: next,
      dryRun,
      file,
      message: 'Patched Stripe-specific checkout page code for Adyen.',
    })
  }

  return changes
}

const patchConfirmOrder = async (cwd: string, dryRun: boolean, force: boolean) => {
  const changes: Change[] = []
  const file = path.join(cwd, 'src', 'components', 'checkout', 'ConfirmOrder.tsx')

  if (!existsSync(file)) {
    return changes
  }

  const content = await readText(file)

  if (
    !force &&
    (content.includes('AdyenRedirectReturn') ||
      (!content.includes('payment_intent') && !content.includes("confirmOrder('stripe'")))
  ) {
    return changes
  }

  let next = content

  next = removeImportLine(next, '@payloadcms/plugin-ecommerce/client/react')
  next = ensureImport(
    next,
    "import { useCart } from '@payloadcms/plugin-ecommerce/client/react'",
    /import \{ LoadingSpinner \} from '@\/components\/LoadingSpinner'/,
  )
  next = ensureImport(
    next,
    "import { AdyenRedirectReturn } from 'payload-payment-adyen/react'",
    /import \{ useCart \} from '@payloadcms\/plugin-ecommerce\/client\/react'/,
  )
  next = next.replace("import { useEffect, useRef } from 'react'", "import { useEffect } from 'react'")
  next = next.replace(/[ \t]*const \{ confirmOrder \} = usePayments\(\)\r?\n/, '')
  next = next.replace(/[ \t]*\/\/ Ensure we only confirm the order once, even if the component re-renders\r?\n[ \t]*const isConfirming = useRef\(false\)\r?\n/, '')
  next = next.replace(
    /const searchParams = useSearchParams\(\)\r?\n[ \t]*const router = useRouter\(\)/,
    `const searchParams = useSearchParams()
  const router = useRouter()
  const sessionID = searchParams.get('sessionId')
  const redirectResult = searchParams.get('redirectResult')
  const email = searchParams.get('email')`,
  )
  next = next.replace(
    /useEffect\(\(\) => \{[\s\S]*?\}, \[cart, confirmOrder, router, searchParams\]\)/,
    `useEffect(() => {
    if (!cart || !cart.items || cart.items?.length === 0) {
      return
    }

    if (!sessionID || !redirectResult) {
      router.push('/')
    }
  }, [cart, redirectResult, router, sessionID])`,
  )
  next = next.replace(
    /return \(\r?\n[ \t]*<div className="text-center w-full flex flex-col items-center justify-start gap-4">/,
    `if (sessionID && redirectResult) {
    return (
      <AdyenRedirectReturn
        redirectResult={redirectResult}
        sessionID={sessionID}
        onOrderConfirmed={({ accessToken, customerEmail, orderID }) => {
          const queryParams = new URLSearchParams()
          const resolvedEmail = customerEmail || email

          if (resolvedEmail) {
            queryParams.set('email', resolvedEmail)
          }
          if (accessToken) {
            queryParams.set('accessToken', accessToken)
          }

          const queryString = queryParams.toString()
          router.push(\`/orders/\${orderID}\${queryString ? \`?\${queryString}\` : ''}\`)
        }}
      />
    )
  }

  return (
    <div className="text-center w-full flex flex-col items-center justify-start gap-4">`,
  )

  if (next !== content) {
    await writeText({
      changes,
      content: next,
      dryRun,
      file,
      message: 'Patched Stripe-specific redirect confirmation code for Adyen.',
    })
  }

  return changes
}

const patchPackageJSON = async (cwd: string, dryRun: boolean, removeStripe: boolean) => {
  const changes: Change[] = []

  if (!removeStripe) {
    return changes
  }

  const file = path.join(cwd, 'package.json')
  const json = JSON.parse(await readText(file)) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
  }

  const stripePackages = ['@stripe/react-stripe-js', '@stripe/stripe-js', 'stripe']
  let changed = false

  for (const dependencySet of [json.dependencies, json.devDependencies]) {
    if (!dependencySet) {
      continue
    }

    for (const packageName of stripePackages) {
      if (dependencySet[packageName]) {
        delete dependencySet[packageName]
        changed = true
      }
    }
  }

  if (json.scripts?.['stripe-webhooks']) {
    delete json.scripts['stripe-webhooks']
    changed = true
  }

  if (changed) {
    await writeText({
      changes,
      content: `${JSON.stringify(json, null, 2)}\n`,
      dryRun,
      file,
      message: 'Removed Stripe packages and stripe-webhooks script from package.json.',
    })
  }

  return changes
}

const patchSeedTransactions = async (cwd: string, dryRun: boolean, removeStripe: boolean) => {
  const changes: Change[] = []

  if (!removeStripe) {
    return changes
  }

  const file = path.join(cwd, 'src', 'endpoints', 'seed', 'index.ts')

  if (!existsSync(file)) {
    return changes
  }

  const content = await readText(file)
  const stripeSeedBlock =
    /paymentMethod: 'stripe',\r?\n[ \t]*stripe: \{\r?\n[ \t]*customerID: 'cus_123',\r?\n[ \t]*paymentIntentID: 'pi_123',\r?\n[ \t]*\},/g

  if (!stripeSeedBlock.test(content)) {
    return changes
  }

  const next = content.replace(
    stripeSeedBlock,
    `paymentMethod: 'adyen',
      adyen: {
        merchantReference: 'seed-merchant-reference',
        pspReference: 'seed-psp-reference',
        resultCode: 'Authorised',
      },`,
  )

  await writeText({
    changes,
    content: next,
    dryRun,
    file,
    message: 'Converted Stripe seed transactions to Adyen seed transactions.',
  })

  return changes
}

const removeStripeCheckoutForm = async (cwd: string, dryRun: boolean, removeStripe: boolean) => {
  const changes: Change[] = []

  if (!removeStripe) {
    return changes
  }

  const file = path.join(cwd, 'src', 'components', 'forms', 'CheckoutForm', 'index.tsx')

  if (!existsSync(file)) {
    return changes
  }

  const content = await readText(file)

  if (!content.includes('@stripe/react-stripe-js')) {
    return changes
  }

  changes.push({
    file,
    message: 'Removed unused Stripe CheckoutForm component.',
  })

  if (!dryRun) {
    await rm(file)
  }

  return changes
}

const assertStarter = (cwd: string) => {
  const required = [
    'package.json',
    path.join('src', 'plugins', 'index.ts'),
    path.join('src', 'providers', 'index.tsx'),
  ]

  const missing = required.filter((file) => !existsSync(path.join(cwd, file)))

  if (missing.length > 0) {
    throw new Error(
      `This does not look like the expected Payload Ecommerce Starter. Missing: ${missing.join(', ')}`,
    )
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const cwd = path.resolve(options.cwd)

  assertStarter(cwd)

  const changes = [
    ...(await patchServerAdapter(cwd, options.dryRun, options.removeStripe)),
    ...(await patchClientProvider(cwd, options.dryRun, options.removeStripe)),
    ...(await patchAdyenCSS(cwd, options.dryRun)),
    ...(await patchEnvFile(path.join(cwd, '.env.example'), options.dryRun)),
    ...(await patchEnvFile(path.join(cwd, '.env'), options.dryRun)),
    ...(await patchCheckoutPage(cwd, options.dryRun, options.force)),
    ...(await patchConfirmOrder(cwd, options.dryRun, options.force)),
    ...(await patchSeedTransactions(cwd, options.dryRun, options.removeStripe)),
    ...(await removeStripeCheckoutForm(cwd, options.dryRun, options.removeStripe)),
    ...(await patchPackageJSON(cwd, options.dryRun, options.removeStripe)),
  ]

  if (changes.length === 0) {
    console.log('No changes needed.')
    return
  }

  console.log(options.dryRun ? 'Planned changes:' : 'Applied changes:')

  for (const change of changes) {
    console.log(`- ${path.relative(cwd, change.file)}: ${change.message}`)
  }

  if (options.removeStripe) {
    console.log('\nRun pnpm install after package.json changes, then run pnpm generate:types.')
  } else {
    console.log('\nRun pnpm generate:types after reviewing the changes.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
