import { logger } from '../external-adapter'
import limits from './limits.json'

export const DEFAULT_MINUTE_RATE_LIMIT = 60
export const BURST_UNDEFINED_QUOTA_MULTIPLE = 2

export const DEFAULT_WS_CONNECTIONS = 2
export const DEFAULT_WS_SUBSCRIPTIONS = 10

type HTTPTier = {
  rateLimit1s?: number
  rateLimit1m?: number
  rateLimit1h?: number
}

type WSTier = {
  connections: number
  subscriptions: number
}

interface Limits {
  [providerName: string]: {
    http: {
      [tierName: string]: HTTPTier
    }
    ws: {
      [tierName: string]: WSTier
    }
  }
}

interface ProviderRateLimit {
  second: number
  minute: number
}

export const getBurstLimit = (provider: string, tier: string): number => {
  const providerLimit = getProviderLimits(provider, tier, 'http')
  return (providerLimit as HTTPTier)?.rateLimit1m || 0
}

export const getRateLimit = (provider: string, tier: string): ProviderRateLimit => {
  const providerLimit = getProviderLimits(provider, tier, 'http')
  return calculateRateLimit(providerLimit as HTTPTier)
}

export const getWSLimits = (provider: string, tier: string): WSTier => {
  const providerLimit = getProviderLimits(provider, tier, 'ws')
  return calculateWSLimits(providerLimit as WSTier)
}

const getProviderLimits = (
  provider: string,
  tier: string,
  protocol: 'ws' | 'http',
): HTTPTier | WSTier | undefined => {
  const parsedLimits = parseLimits(limits)
  const providerConfig = parsedLimits[provider.toLowerCase()]
  if (!providerConfig)
    throw new Error(
      `Rate Limit: Provider: "${provider}" doesn't match any provider spec in limits.json`,
    )

  const protocolConfig = providerConfig[protocol]
  if (!protocolConfig)
    throw new Error(
      `Rate Limit: "${provider}" doesn't have any configuration for ${protocol} in limits.json`,
    )

  let limitsConfig = protocolConfig[tier.toLowerCase()]

  if (!limitsConfig) {
    logger.debug(
      `Rate Limit: "${provider} does not have tier ${tier} defined. Falling back to lowest tier"`,
    )
    limitsConfig = Object.values(protocolConfig)?.[0]
  }

  if (!limitsConfig)
    throw new Error(
      `Rate Limit: Provider: "${provider}" has no tiers defined for ${protocol} in limits.json`,
    )

  return limitsConfig
}

const parseLimits = (limits: any): Limits => {
  const _mapObject = (fn: any) => (o: any) => Object.fromEntries(Object.entries(o).map(fn))
  const _formatProtocol = _mapObject((entry: any[]) => {
    const [tierName, rest] = entry
    return [tierName.toLowerCase(), { ...(rest as any) }]
  })
  const _formatProvider = _mapObject((entry: any[]) => {
    const [providerName, protocol] = entry
    const http = _formatProtocol(protocol.http)
    const ws = _formatProtocol(protocol?.ws)
    return [providerName.toLowerCase(), { http, ws }]
  })

  return _formatProvider(limits)
}

const calculateWSLimits = (providerLimit: WSTier): WSTier => {
  return {
    connections: providerLimit.connections,
    subscriptions: providerLimit.subscriptions,
  }
}

const calculateRateLimit = (providerLimit: HTTPTier): ProviderRateLimit => {
  let quota = providerLimit.rateLimit1m
  if (!quota && providerLimit?.rateLimit1h) {
    quota = providerLimit?.rateLimit1h / 60
  } else if (!quota && providerLimit?.rateLimit1s) {
    quota = providerLimit?.rateLimit1s * 60
  }
  return {
    second: providerLimit?.rateLimit1s || ((quota as number) / 60) * BURST_UNDEFINED_QUOTA_MULTIPLE,
    minute: quota as number,
  }
}
