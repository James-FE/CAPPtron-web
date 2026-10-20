export type ProgramFormat = {
  encoding: 'ascii' | 'utf-8' | 'utf-16le' | 'utf-16be'
  bom: boolean
  newline: 'CRLF' | 'LF' | 'CR' | 'mixed' | 'none'
}

export function decodeProgram(bytes: Uint8Array): { text: string; format: ProgramFormat } {
  const utf16le = bytes[0] === 255 && bytes[1] === 254
  const utf16be = bytes[0] === 254 && bytes[1] === 255
  const utf8bom = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191
  const encoding = utf16le
    ? 'utf-16le'
    : utf16be
      ? 'utf-16be'
      : bytes.every((b) => b < 128)
        ? 'ascii'
        : 'utf-8'
  let text: string
  try {
    text = new TextDecoder(encoding === 'ascii' ? 'utf-8' : encoding, { fatal: true }).decode(bytes)
  } catch {
    throw new Error('无法可靠识别或解码程序编码；未替换字符，请核实源文件编码。')
  }
  if (
    !text.trim() ||
    Array.from(text).some(
      (char) => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)),
    )
  )
    throw new Error('程序为空或含非文本控制字符。')
  const crlf = /\r\n/.test(text),
    lf = /(?<!\r)\n/.test(text),
    cr = /\r(?!\n)/.test(text)
  const newline =
    Number(crlf) + Number(lf) + Number(cr) > 1
      ? 'mixed'
      : crlf
        ? 'CRLF'
        : lf
          ? 'LF'
          : cr
            ? 'CR'
            : 'none'
  return {
    text: text.replace(/\r\n?|\n/g, '\n'),
    format: { encoding, bom: utf16le || utf16be || utf8bom, newline },
  }
}

export function encodeProgram(text: string, format: ProgramFormat): Uint8Array<ArrayBuffer> {
  if (!text.trim()) throw new Error('空程序不能导出。')
  if (format.newline === 'mixed') throw new Error('原文混合换行，无法可靠保持格式；请先核实来源。')
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text))
    throw new Error('草稿包含无效 Unicode 字符。')
  const normalized = text.replace(/\r\n?|\n/g, '\n')
  const output = normalized.replace(
    /\n/g,
    format.newline === 'CRLF' ? '\r\n' : format.newline === 'CR' ? '\r' : '\n',
  )
  if (format.encoding === 'ascii' && Array.from(output).some((char) => char.charCodeAt(0) > 127))
    throw new Error('草稿含非 ASCII 字符，无法保持原始编码；请移除这些字符后导出。')
  if (format.encoding.startsWith('utf-16')) {
    const bytes = new Uint8Array((output.length + (format.bom ? 1 : 0)) * 2)
    const view = new DataView(bytes.buffer),
      little = format.encoding === 'utf-16le'
    let offset = 0
    if (format.bom) {
      view.setUint16(0, 0xfeff, little)
      offset = 2
    }
    for (let i = 0; i < output.length; i++)
      view.setUint16(offset + i * 2, output.charCodeAt(i), little)
    return bytes
  }
  return new TextEncoder().encode((format.bom ? '\ufeff' : '') + output)
}
