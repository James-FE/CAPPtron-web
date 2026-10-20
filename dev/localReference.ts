import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { Plugin } from 'vite'

export async function readVerifiedReference(
  path: string,
  expected: { sha256?: string; sizeBytes?: number },
) {
  const bytes = await readFile(path)
  if (
    bytes.length !== expected.sizeBytes ||
    createHash('sha256').update(bytes).digest('hex') !== expected.sha256
  )
    throw new Error('digest_mismatch')
  return bytes
}

// 单一资产白名单；不接收客户端路径，不在 build / preview 注册中间件。
export function localReferencePlugin(path: string | undefined, enabled: boolean): Plugin {
  return {
    name: 'capptron-local-reference',
    apply: 'serve',
    configureServer(server) {
      if (!enabled || !path || !isAbsolute(path)) return
      if (!['127.0.0.1', 'localhost', '::1'].includes(String(server.config.server.host)))
        throw new Error('私有参考资产仅允许 loopback 开发服务。')
      const endpoint = `${server.config.base}__local_reference/golden-b7`
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(endpoint)) return next()
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        const host = req.headers.host ?? ''
        const origin = req.headers.origin
        const allowed =
          /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host) &&
          ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
          (!origin || origin === `http://${host}`) &&
          (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin') &&
          req.headers['x-capptron-local-reference'] === '1'
        if (!allowed || req.method !== 'GET' || req.url !== endpoint) {
          res.statusCode = 403
          res.end('reference_denied')
          return
        }
        try {
          const catalog = JSON.parse(
            await readFile(
              new URL('../public/case-catalog/golden-b7/v2.json', import.meta.url),
              'utf8',
            ),
          )
          const asset = catalog.programAssets.find(
            (item: { id: string }) => item.id === 'golden-b7-nc',
          )
          const bytes = await readVerifiedReference(path, asset)
          res.setHeader('Content-Type', 'application/octet-stream')
          res.end(bytes)
        } catch (error) {
          res.statusCode = error instanceof Error && error.message === 'digest_mismatch' ? 409 : 404
          res.end(res.statusCode === 409 ? 'reference_digest_mismatch' : 'reference_unavailable')
        }
      })
    },
  }
}
