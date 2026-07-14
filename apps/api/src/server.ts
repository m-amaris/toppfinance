import { buildApp } from './app.js'
import { config } from './config.js'
import { appLog } from './logging.js'
import { LogLevel, LogCategory } from '@toppfinance/shared'

const app = await buildApp({ logger: true })

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  await appLog({
    level: LogLevel.INFO,
    category: LogCategory.APPLICATION,
    message: 'API iniciada',
    metadata: { port: config.PORT },
  })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
