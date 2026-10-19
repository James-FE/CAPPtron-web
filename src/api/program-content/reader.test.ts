// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localProgramContentReader, verifyProgramBytes } from './reader'
import { readVerifiedReference, localReferencePlugin } from '../../../dev/localReference'
import type { ProgramAsset, CaseDocument } from '../case-catalog/types'
import { createServer } from 'vite'

const bytes = new TextEncoder().encode('SYNTHETIC TEST ONLY - NOT EXECUTABLE\r\n')
const asset: ProgramAsset = {
  id: 'test',
  caseId: 'test',
  caseVersion: 'v1',
  planId: 'test-plan',
  kind: 'nc',
  source: 'test',
  availability: 'metadata_only',
  boundary: 'test only',
  sizeBytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
}
const catalog = {
  case: { id: 'test' },
  caseVersion: { version: 'v1' },
  processPlan: { id: 'test-plan' },
} as CaseDocument
afterEach(() => vi.unstubAllGlobals())
describe('受控参考读取', () => {
  it('按原始字节核对大小和摘要，任何差异均拒绝', async () => {
    expect(await verifyProgramBytes(bytes, asset)).toBe(asset.sha256)
    await expect(verifyProgramBytes(bytes, { ...asset, sizeBytes: 1 })).rejects.toThrow('不匹配')
    await expect(verifyProgramBytes(bytes, { ...asset, sha256: 'bad' })).rejects.toThrow('不匹配')
    await expect(verifyProgramBytes(bytes, { ...asset, sha256: undefined })).rejects.toThrow()
  })
  it('单文件读取成功、失配与缺失均可区分，不依赖私人目录', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'capptron-test-'))
    try {
      const path = join(directory, 'synthetic.txt')
      await writeFile(path, bytes)
      expect(await readVerifiedReference(path, asset)).toEqual(Buffer.from(bytes))
      await expect(readVerifiedReference(path, { ...asset, sha256: 'bad' })).rejects.toThrow(
        'digest_mismatch',
      )
      await expect(readVerifiedReference(join(directory, 'absent.txt'), asset)).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true })
    }
  })
  it('测试传输明确保留 fixture 来源，浏览器再次核验；错误响应不产生正文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(bytes, {
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-CAPPtron-Content-Source': 'demo_fixture',
            },
          }),
      ),
    )
    const content = await localProgramContentReader.read(
      catalog,
      asset,
      new AbortController().signal,
    )
    expect(content.source).toBe('demo_fixture')
    expect(content.format).toEqual({ encoding: 'ascii', bom: false, newline: 'CRLF' })
    await expect(
      localProgramContentReader.read(
        catalog,
        { ...asset, sha256: 'bad' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('不匹配')
    for (const status of [404, 409]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('', { status })),
      )
      await expect(
        localProgramContentReader.read(catalog, asset, new AbortController().signal),
      ).rejects.toThrow(status === 409 ? '不匹配' : '暂不可用')
    }
  })
  it('插件仅服务开发模式，不提供 preview 钩子', () => {
    const plugin = localReferencePlugin(undefined, false)
    expect(plugin.apply).toBe('serve')
    expect(plugin.configurePreviewServer).toBeUndefined()
  })
  it('实际开发端拒绝跨源、任意路径、非 GET、缺少请求标识和失配正文', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'capptron-endpoint-test-'))
    const path = join(directory, 'synthetic.txt')
    await writeFile(path, bytes)
    const server = await createServer({
      configFile: false,
      root: directory,
      publicDir: false,
      optimizeDeps: { noDiscovery: true, include: [] },
      base: '/test/',
      plugins: [localReferencePlugin(path, true)],
      server: { host: '127.0.0.1', port: 0 },
    })
    try {
      await server.listen()
      const address = server.httpServer!.address()
      if (!address || typeof address === 'string') throw new Error('测试端口不可用')
      const url = `http://127.0.0.1:${address.port}/test/__local_reference/golden-b7`
      const headers = { 'X-CAPPtron-Local-Reference': '1' }
      expect((await fetch(url)).status).toBe(403)
      expect(
        (await fetch(url, { headers: { ...headers, Origin: 'https://untrusted.example' } })).status,
      ).toBe(403)
      expect((await fetch(`${url}?path=other`, { headers })).status).toBe(403)
      expect((await fetch(url, { headers, method: 'POST' })).status).toBe(403)
      const response = await fetch(url, { headers })
      expect(response.status).toBe(409)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.text()).toBe('reference_digest_mismatch')
    } finally {
      await server.close()
      await rm(directory, { recursive: true })
    }
  })
})
