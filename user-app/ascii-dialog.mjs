import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const f = process.argv[2]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const buf = readFileSync(f)
await page.setContent(`<img id="i" src="data:image/png;base64,${buf.toString('base64')}">`)
await page.waitForFunction(() => document.getElementById('i').naturalWidth > 0, null, { timeout: 10000 })
const data = await page.evaluate(() => {
  const img = document.getElementById('i')
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const px = ctx.getImageData(0, 0, w, h).data

  const isDialog = (i) => {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    return Math.abs(r - 24) <= 6 && Math.abs(g - 24) <= 6 && Math.abs(b - 27) <= 6
  }
  let minX = w, minY = h, maxX = 0, maxY = 0, n = 0
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4
      if (isDialog(i)) {
        n++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const out = ['dialog #18181b: n=' + n + ' bbox x' + minX + '-' + maxX + ' y' + minY + '-' + maxY]

  const dw = maxX - minX, dh = maxY - minY
  const cols = 60, rows = 40
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let col = 0; col < cols; col++) {
      const x = minX + Math.floor((col / cols) * dw)
      const y = minY + Math.floor((r / rows) * dh)
      const i = (y * w + x) * 4
      const rr = px[i], g = px[i + 1], b = px[i + 2]
      const lum = (rr * 0.3 + g * 0.59 + b * 0.11)
      if (isDialog(i)) line += ' '
      else if (lum > 200) line += '#'
      else if (lum > 120) line += '+'
      else if (lum > 60) line += ':'
      else if (lum > 20) line += '.'
      else line += '·'
    }
    out.push(line)
  }
  return out
})
for (const line of data) console.log(line)
await browser.close()