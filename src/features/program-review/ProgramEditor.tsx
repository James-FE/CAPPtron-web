import { useLayoutEffect, useRef } from 'react'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import type { ProgramDocument } from './programDocument'

const externalChange = Annotation.define<boolean>()
export function ProgramEditor({
  document,
  onChange,
}: {
  document: ProgramDocument
  onChange: (text: string, revision: number) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef({ document, onChange })
  useLayoutEffect(() => {
    latest.current = { document, onChange }
  })
  useLayoutEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: latest.current.document.draftText,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([
            { key: 'Mod-Shift-z', run: redo, preventDefault: true },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.contentAttributes.of({ 'aria-label': 'NC 程序草稿', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((t) => t.annotation(externalChange)))
              latest.current.onChange(update.state.doc.toString(), latest.current.document.revision)
          }),
          EditorView.theme(
            {
              '&': {
                height: '100%',
                fontSize: '14px',
                backgroundColor: 'var(--surface-canvas)',
                color: 'var(--text-primary)',
              },
              '.cm-scroller': {
                overflow: 'auto',
                fontFamily: 'Consolas, monospace',
                lineHeight: '24px',
              },
              '.cm-content': { padding: '12px 0', caretColor: 'var(--accent-primary)' },
              '.cm-gutters': {
                backgroundColor: 'var(--surface-canvas)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              },
              '.cm-cursor': { borderLeftColor: 'var(--accent-primary)' },
              '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
                backgroundColor: '#2b5b51 !important',
              },
            },
            { dark: true },
          ),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [document.id])
  useLayoutEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== document.draftText)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: document.draftText },
        annotations: externalChange.of(true),
      })
  }, [document.draftText])
  return (
    <div className="program-editor-layout">
      <div className="editor-commands">
        <button
          className="button"
          onClick={() => {
            if (view.current) {
              undo(view.current)
              view.current.focus()
            }
          }}
        >
          撤销
        </button>
        <button
          className="button"
          onClick={() => {
            if (view.current) {
              redo(view.current)
              view.current.focus()
            }
          }}
        >
          重做
        </button>
        <span className="muted-text">Ctrl / ⌘ Z 撤销 · Ctrl / ⌘ Shift Z 重做 · 不自动折行</span>
      </div>
      <div className="program-editor" ref={host} />
    </div>
  )
}
