import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataFoundationReader } from '../../api/data-foundation/reader'
import { assetKinds, type AssetKind, type AssetReference } from '../../api/data-foundation/types'
import { useFoundationQuery } from './useFoundationQuery'
import { FoundationResult, FoundationSource } from './FoundationShared'
import { FoundationAssetDetail } from './FoundationAssetDetail'
import { assetLabels, number, timestamp } from './presentation'

export function FoundationAssetBrowser({
  reader,
  initialKind,
  initialSelected,
  onClose,
}: {
  reader: DataFoundationReader
  initialKind: AssetKind
  initialSelected?: AssetReference
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [kind, setKind] = useState(initialKind)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ keyword: '', page: 1 })
  const [selected, setSelected] = useState<AssetReference | null>(initialSelected ?? null)
  const list = useFoundationQuery(
    useCallback(
      () =>
        reader.listAssets({ kind, ...query, pageSize: 10, sortBy: 'name', sortDirection: 'asc' }),
      [reader, kind, query],
    ),
  )
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement as HTMLElement | null
    element?.showModal()
    return () => {
      element?.close()
      if (opener?.isConnected && !opener.closest('[hidden], [inert]')) opener.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="foundation-browser"
      aria-labelledby="foundation-browser-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0)
        const first = controls[0],
          last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header className="foundation-browser-heading">
        <div>
          <h2 id="foundation-browser-title">资源目录</h2>
          <p>只读查看 · 按名称搜索，沿关联 ID 核查详情</p>
        </div>
        <button className="button" onClick={onClose} aria-label="关闭资源目录">
          关闭
        </button>
      </header>
      {list.response && <FoundationSource meta={list.response.meta} compact />}
      <form
        className="foundation-search"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery({ keyword: search.trim(), page: 1 })
          setSelected(null)
        }}
      >
        <label>
          资源类型
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as AssetKind)
              setQuery({ keyword: '', page: 1 })
              setSearch('')
              setSelected(null)
            }}
          >
            {assetKinds.map((item) => (
              <option key={item} value={item}>
                {assetLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          名称搜索
          <input
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="输入资源名称"
          />
        </label>
        <button type="submit" className="button">
          搜索
        </button>
      </form>
      <div className="foundation-browser-content">
        <section className="foundation-asset-list" aria-label="资源列表">
          <FoundationResult query={list} label="资源列表">
            {(response) => (
              <>
                <p className="foundation-list-count">
                  {assetLabels[kind]} · 共 {number(response.data.total)} 条
                </p>
                <ul>
                  {response.data.items.map((item) => (
                    <li key={`${item.kind}/${item.id}`}>
                      <button
                        aria-pressed={selected?.kind === item.kind && selected.id === item.id}
                        onClick={() => setSelected({ kind: item.kind, id: item.id })}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.id}</span>
                        <small>
                          {item.provenance.dataMode === 'synthetic_demo' ? '模拟数据' : '真实数据'}{' '}
                          · {timestamp(item.createdAt, response.meta.timeZone)}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
                {response.data.items.length === 0 && (
                  <p className="foundation-state">没有匹配的资源</p>
                )}
                <nav aria-label="资源分页" className="foundation-pagination">
                  <button
                    className="button"
                    disabled={response.data.page <= 1}
                    onClick={() => {
                      setQuery((value) => ({ ...value, page: value.page - 1 }))
                      setSelected(null)
                    }}
                  >
                    上一页
                  </button>
                  <span>
                    第 {response.data.page} /{' '}
                    {Math.max(1, Math.ceil(response.data.total / response.data.pageSize))} 页
                  </span>
                  <button
                    className="button"
                    disabled={response.data.page * response.data.pageSize >= response.data.total}
                    onClick={() => {
                      setQuery((value) => ({ ...value, page: value.page + 1 }))
                      setSelected(null)
                    }}
                  >
                    下一页
                  </button>
                </nav>
              </>
            )}
          </FoundationResult>
        </section>
        {selected ? (
          <FoundationAssetDetail reader={reader} reference={selected} onNavigate={setSelected} />
        ) : (
          <section className="foundation-asset-detail foundation-state" aria-label="资源详情">
            选择左侧记录查看详情
          </section>
        )}
      </div>
    </dialog>
  )
}
