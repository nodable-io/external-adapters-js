import { Requester, Validator, Logger } from '@chainlink/ea-bootstrap'
import {
  Config,
  ExecuteWithConfig,
  AxiosResponse,
  AdapterRequest,
  EndpointResultPaths,
  InputParameters,
} from '@chainlink/types'
import { NAME as AdapterName } from '../config'
import { getCoinIds, getSymbolsToIds } from '../util'

export const supportedEndpoints = ['crypto', 'price', 'marketcap']

const customError = (data: any) => {
  if (Object.keys(data).length === 0) return true
  return false
}

const buildResultPath = (path: string) => (request: AdapterRequest): string => {
  const validator = new Validator(request, inputParameters)
  if (validator.error) throw validator.error
  const quote = validator.validated.data.quote
  return `${quote.toLowerCase()}${path}`
}

export const endpointResultPaths: EndpointResultPaths = {
  price: buildResultPath(''),
  crypto: buildResultPath(''),
  marketcap: buildResultPath('_market_cap'),
}

export const inputParameters: InputParameters = {
  base: ['base', 'from', 'coin'],
  quote: ['quote', 'to', 'market'],
  coinid: false,
  resultPath: false,
  endpoint: false,
}

const handleBatchedRequest = (
  jobRunID: string,
  request: AdapterRequest,
  response: AxiosResponse,
  resultPath: string,
  idToSymbol: Record<string, string>,
) => {
  const payload: [AdapterRequest, number][] = []
  for (const base in response.data) {
    for (const quote in response.data[base]) {
      const symbol = idToSymbol?.[base]
      if (symbol) {
        payload.push([
          {
            ...request,
            data: { ...request.data, base: symbol.toUpperCase(), quote: quote.toUpperCase() },
          },
          Requester.validateResultNumber(response.data, [base, resultPath]),
        ])
      } else Logger.debug('WARNING: Symbol not found ', base)
    }
  }
  response.data.results = payload
  return Requester.success(jobRunID, response, true, ['base', 'quote'])
}

export const execute: ExecuteWithConfig<Config> = async (request, context, config) => {
  const validator = new Validator(request, inputParameters)
  if (validator.error) throw validator.error

  const endpoint = validator.validated.data.endpoint
  const jobRunID = validator.validated.id
  const base = validator.overrideSymbol(AdapterName)
  const quote = validator.validated.data.quote
  const coinid = validator.validated.data.coinid
  let idToSymbol = {}
  let ids = coinid
  if (!ids) {
    const coinIds = await getCoinIds(context, jobRunID)
    const symbols = Array.isArray(base) ? base : [base]
    idToSymbol = getSymbolsToIds(symbols, coinIds)
    ids = Object.keys(idToSymbol).join(',')
  }

  const url = '/simple/price'
  const resultPath: string = validator.validated.data.resultPath

  const params = {
    ids,
    vs_currencies: Array.isArray(quote) ? quote.join(',') : quote,
    include_market_cap: endpoint === 'marketcap',
    x_cg_pro_api_key: config.apiKey,
  }

  const options = {
    ...config.api,
    url,
    params,
  }

  const response = await Requester.request(options, customError)

  if (Array.isArray(base) || Array.isArray(quote))
    return handleBatchedRequest(jobRunID, request, response, resultPath, idToSymbol)

  response.data.result = Requester.validateResultNumber(response.data, [
    ids.toLowerCase(),
    resultPath,
  ])

  return Requester.success(jobRunID, response, config.verbose, ['base', 'quote'])
}
