interface WbiNavData {
  wbi_img?: {
    img_url?: string
    sub_url?: string
  }
}

interface BiliEnvelope<T> {
  code: number
  message?: string
  data?: T
}

const WBI_MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]
const MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]
const MD5_K = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0)

let cachedWbi: { key: string; expiresAt: number } | null = null

function rotateLeft(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0
}

function md5(input: string): string {
  const source = new TextEncoder().encode(input)
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const bytes = new Uint8Array(paddedLength)
  bytes.set(source)
  bytes[source.length] = 0x80

  const bitLength = source.length * 8
  const tail = new DataView(bytes.buffer)
  tail.setUint32(paddedLength - 8, bitLength >>> 0, true)
  tail.setUint32(paddedLength - 4, Math.floor(bitLength / 0x1_0000_0000) >>> 0, true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Uint32Array(16)
    const view = new DataView(bytes.buffer, offset, 64)
    for (let index = 0; index < 16; index += 1)
      words[index] = view.getUint32(index * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let index = 0; index < 64; index += 1) {
      let f = 0
      let g = 0
      if (index < 16) {
        f = (b & c) | (~b & d)
        g = index
      }
      else if (index < 32) {
        f = (d & b) | (~d & c)
        g = (5 * index + 1) % 16
      }
      else if (index < 48) {
        f = b ^ c ^ d
        g = (3 * index + 5) % 16
      }
      else {
        f = c ^ (b | ~d)
        g = (7 * index) % 16
      }

      const previousD = d
      d = c
      c = b
      const sum = (a + (f >>> 0) + MD5_K[index]! + words[g]!) >>> 0
      b = (b + rotateLeft(sum, MD5_SHIFT[index]!)) >>> 0
      a = previousD
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const output = new Uint8Array(16)
  const outputView = new DataView(output.buffer)
  outputView.setUint32(0, a0, true)
  outputView.setUint32(4, b0, true)
  outputView.setUint32(8, c0, true)
  outputView.setUint32(12, d0, true)
  return Array.from(output, byte => byte.toString(16).padStart(2, '0')).join('')
}

function filenameKey(url = ''): string {
  const filename = url.split('/').pop() ?? ''
  return filename.split('.')[0] ?? ''
}

async function getWbiMixinKey(): Promise<string> {
  if (cachedWbi && cachedWbi.expiresAt > Date.now())
    return cachedWbi.key

  const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    credentials: 'include',
    headers: { Accept: 'application/json, text/plain, */*' },
    referrer: 'https://www.bilibili.com/',
    referrerPolicy: 'strict-origin-when-cross-origin',
  })
  if (!response.ok)
    throw new Error(`WBI nav HTTP ${response.status}`)

  const payload = await response.json() as BiliEnvelope<WbiNavData>
  if (payload.code !== 0 || !payload.data)
    throw new Error(payload.message || `WBI nav error ${payload.code}`)

  const rawKey = `${filenameKey(payload.data.wbi_img?.img_url)}${filenameKey(payload.data.wbi_img?.sub_url)}`
  const key = WBI_MIXIN_KEY_ENC_TAB.map(index => rawKey[index] ?? '').join('').slice(0, 32)
  if (!key)
    throw new Error('Bilibili WBI key unavailable')

  cachedWbi = { key, expiresAt: Date.now() + 6 * 60 * 60 * 1000 }
  return key
}

export async function signWbiQuery(values: Record<string, string>): Promise<string> {
  const mixinKey = await getWbiMixinKey()
  const params = { ...values, wts: String(Math.floor(Date.now() / 1000)) }
  const query = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const filtered = value.replace(/[!'()*]/g, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(filtered)}`
    })
    .join('&')
  return `${query}&w_rid=${md5(query + mixinKey)}`
}
