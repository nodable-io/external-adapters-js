import { expose } from '@chainlink/ea-bootstrap'
import { makeExecute, endpointSelector } from './adapter'
import { makeConfig, NAME } from './config'

const server = expose(makeExecute(), undefined, endpointSelector).server

export { NAME, makeConfig, makeExecute, server }
