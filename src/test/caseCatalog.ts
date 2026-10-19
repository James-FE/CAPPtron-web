import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { vi } from 'vitest'

// 组件测试只替换传输与 WebCrypto 环境，继续执行真实 Schema、摘要和 Adapter。
export function installCatalogFetchMock() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const relative = url.replace(/^.*case-catalog\//, '')
      return new Response(readFileSync(`public/case-catalog/${relative}`, 'utf8'), {
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  vi.stubGlobal('crypto', {
    randomUUID: () => `test-${Math.random()}`,
    subtle: {
      digest: async (_algorithm: string, bytes: Uint8Array) => {
        const hash = createHash('sha256').update(bytes).digest()
        return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength)
      },
    },
  })
}
