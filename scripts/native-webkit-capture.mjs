// WebKit's snapshot API omits macOS backdrop layers. Capture the actual owned
// window instead; retain the same viewport pixels and contrast assertions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let directory;
const readWindows = () => {
  if (!directory) {
    directory = mkdtempSync(join(tmpdir(), 'portfolio-webkit-window-'));
    const source = join(directory, 'windows.swift');
    writeFileSync(source, `import CoreGraphics; import Foundation
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements], kCGNullWindowID) as? [[String:Any]] ?? []
let owned = windows.filter { ($0[kCGWindowOwnerName as String] as? String) == "Playwright" && ($0[kCGWindowLayer as String] as? Int) == 0 }
let records = owned.map { ["id": $0[kCGWindowNumber as String]!, "pid": $0[kCGWindowOwnerPID as String]!, "name": $0[kCGWindowName as String] ?? "", "bounds": $0[kCGWindowBounds as String]!] }
print(String(data: try! JSONSerialization.data(withJSONObject: records), encoding: .utf8)!)`);
    execFileSync('swiftc', [source, '-o', join(directory, 'windows')]);
    process.once('exit', () => rmSync(directory, {recursive:true, force:true}));
  }
  return JSON.parse(execFileSync(join(directory, 'windows'), {encoding:'utf8'}));
};
const repaint = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

export const useNativeWebKitCapture = async page => {
  assert.equal(process.platform, 'darwin', 'Native WebKit capture requires macOS.');
  await page.bringToFront();
  assert.equal(page.url(), 'about:blank', 'Bind the native window before loading the audited site.');
  const markerUrl = `https://portfolio-audit.invalid/${randomUUID()}`;
  let owned;
  await page.route(markerUrl, route => route.fulfill({contentType:'text/html', body:`<!doctype html><title>${markerUrl}</title>`}));
  try {
    await page.goto(markerUrl);
    await repaint(page);
    const visible = readWindows();
    const windows = visible.filter(window => window.name.endsWith(`Playwright: ${markerUrl}`));
    assert.equal(windows.length, 1, 'Expected the uniquely addressed owned Playwright window; refusing an ambiguous capture.');
    owned = windows[0];
  } finally { await page.goto('about:blank'); await page.unroute(markerUrl); }
  page.screenshot = async (options = {}) => {
    assert.ok(Object.keys(options).every(key => key === 'path'), 'Native audit captures the viewport as PNG.');
    // The caller brings the page forward before collecting DOM samples. Here
    // only wait for the hidden-ink paint; never change focus between samples.
    await repaint(page);
    const viewport = await page.evaluate(() => ({width:innerWidth, height:innerHeight, outerWidth, outerHeight}));
    const window = readWindows().find(window => window.id === owned.id && window.pid === owned.pid);
    assert.ok(window, 'The owned WebKit window must still be visible.');
    assert.equal(window.bounds.Width, viewport.width, 'MiniBrowser viewport must span its native window width.');
    assert.equal(viewport.outerWidth, window.bounds.Width, 'Native and DOM outer widths must agree.');
    assert.equal(viewport.outerHeight, window.bounds.Height, 'Native and DOM outer heights must agree.');
    const path = join(directory, `${owned.id}.png`);
    execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', String(owned.id), path]);
    const screenshot = readFileSync(path).toString('base64');
    const cropped = await page.evaluate(async ({screenshot, viewport}) => {
      const image = new Image(); image.src = `data:image/png;base64,${screenshot}`; await image.decode();
      const scale = image.width / viewport.outerWidth;
      const height = Math.round(viewport.height * scale), top = image.height - height;
      if (Math.abs(scale - image.height / viewport.outerHeight) > .01 || Math.abs(scale - Math.round(scale)) > .01
          || scale < 1 || scale > 3 || top < 0 || top > 140 * scale) {
        throw new Error('Native window does not contain the complete expected viewport at a uniform scale.');
      }
      // Only crop browser chrome. The canvas converts the native PNG profile to
      // sRGB without resizing; no synthetic background or rendering fallback.
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = height;
      canvas.getContext('2d', {colorSpace:'srgb'}).drawImage(image, 0, top, image.width, height, 0, 0, image.width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, {screenshot, viewport});
    const bytes = Buffer.from(cropped, 'base64');
    if (options.path) writeFileSync(options.path, bytes);
    return bytes;
  };
};

export const verifyNativeBackdropCapture = async browser => {
  const page = await browser.newPage({viewport:{width:300,height:220}});
  try {
    await useNativeWebKitCapture(page);
    await page.setContent('<style>body{margin:0;background:repeating-linear-gradient(90deg,#fff 0 10px,#000 10px 20px)}div{position:absolute;inset:20px;background:rgba(35,36,32,.5);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}</style><div></div>');
    const blurred = await page.screenshot();
    await page.locator('div').evaluate(e => {e.style.backdropFilter='none';e.style.webkitBackdropFilter='none';});
    const plain = await page.screenshot();
    assert.ok(!blurred.equals(plain), 'Native screenshot must render backdrop blur before measuring glass contrast.');
  } finally { await page.close(); }
};
