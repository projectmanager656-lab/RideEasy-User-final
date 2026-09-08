import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const files = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()

for (const f of files) {
  const buf = readFileSync(f)
  const b64 = buf.toString('base64')
  await page.setContent(`<img id="i" src="data:image/png;base64,${b64}">`)
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
    const out = []
    const region = (label, x0, y0, x1, y1) => {
      const cols = {}
      for (let y = y0; y < y1; y += 3) {
        for (let x = x0; x < x1; x += 3) {
          const i = (y * w + x) * 4
          const key = (px[i]).toString(16).padStart(2, '0') + (px[i + 1]).toString(16).padStart(2, '0') + (px[i + 2]).toString(16).padStart(2, '0')
          cols[key] = (cols[key] || 0) + 1
        }
      }
      const top = Object.entries(cols).sort((a, b) => b[1] - a[1]).slice(0, 6)
      out.push(label + ' ' + JSON.stringify(top))
    }
    region('top-strip y0-120  :', 0, 0, w, 120)
    region('top-strip y120-500:', 0, 120, w, 500)
    region('mid y900-1020     :', 0, 900, w, 1020)
    region('text y1000-1120   :', w / 2 - 400, 1000, w / 2 + 400, 1120)
    region('bottom-left       :', 0, h - 700, 700, h - 100)
    region('bottom-mid        :', w / 2 - 400, h - 300, w / 2 + 400, h - 150)
    const find = (label, test) => {
      let minX = w, minY = h, maxX = 0, maxY = 0, n = 0
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const i = (y * w + x) * 4
          if (test(px[i], px[i + 1], px[i + 2])) {
            n++
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      out.push(label + ' n=' + n + ' bbox x' + minX + '-' + maxX + ' y' + minY + '-' + maxY)
    }
    find('ORANGE  ', (r, g, b) => r > 200 && g > 120 && g < 200 && b < 100)
    find('RED     ', (r, g, b) => r > 200 && g < 120 && b < 120)
    find('GREEN   ', (r, g, b) => r < 60 && g > 90 && g < 180 && b < 110)
    find('BLUE-ish', (r, g, b) => b > 150 && r < 100 && g < 120)
    find('WHITE   ', (r, g, b) => r > 200 && g > 200 && b > 200)
    return { size: w + 'x' + h, out }
  })
  console.log('=== ' + f.split('/').pop() + ' (' + data.size + ') ===')
  for (const line of data.out) console.log(line)
}

await browser.close()