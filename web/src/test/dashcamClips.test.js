/**
 * Tests for camera clip listing parsers and the Telegram upload size gate.
 */
import { describe, expect, it } from 'vitest'
import { parseListing } from '../services/dashcamClips'
import { TELEGRAM_MAX_BYTES } from '../config/dashcam'
import { telegramMessageUrl } from '../services/dashcamUpload'

describe('parseListing', () => {
  it('reads video hrefs from an HTML directory index', () => {
    const html = `
      <html><body>
        <a href="20251018_120001_FR.MP4">20251018_120001_FR.MP4</a>
        <a href="/CARDV/MOVIE/RO/lock_001.mov">lock</a>
        <a href="readme.txt">ignore</a>
      </body></html>
    `
    const clips = parseListing(html, '192.168.1.254', '/CARDV/MOVIE/', false)
    expect(clips.map((c) => c.name).sort()).toEqual([
      '20251018_120001_FR.MP4',
      'lock_001.mov',
    ])
    expect(clips[0].url).toContain('http://192.168.1.254/CARDV/MOVIE/')
  })

  it('reads name/size pairs from flat CGI text', () => {
    const body = [
      'name=clip_a.mp4 size=1234567',
      'name=clip_b.MP4 size=999',
      'name=photo.jpg size=100',
    ].join('\n')
    const clips = parseListing(body, '192.168.1.254', '/CARDV/MOVIE/RO/', true)
    expect(clips).toHaveLength(2)
    expect(clips.every((c) => c.locked)).toBe(true)
    expect(clips.find((c) => c.name === 'clip_a.mp4').size).toBe(1234567)
  })

  it('reads a JSON file list', () => {
    const body = JSON.stringify({
      files: [
        { name: 'a.mp4', size: 10 },
        { filename: 'b.mov', filesize: 20 },
      ],
    })
    const clips = parseListing(body, '192.168.169.1', '/CARDV/MOVIE/', false)
    expect(clips).toHaveLength(2)
    expect(clips.find((c) => c.name === 'b.mov').size).toBe(20)
  })

  it('dedupes the same filename seen twice', () => {
    const body = '<a href="same.mp4">x</a><a href="same.mp4">y</a>'
    expect(parseListing(body, '192.168.1.254', '/CARDV/MOVIE/', false)).toHaveLength(1)
  })
})

describe('TELEGRAM_MAX_BYTES', () => {
  it('stays under the public Bot API multipart ceiling', () => {
    expect(TELEGRAM_MAX_BYTES).toBeLessThanOrEqual(49 * 1024 * 1024)
    expect(TELEGRAM_MAX_BYTES).toBeGreaterThan(40 * 1024 * 1024)
  })
})

describe('telegramMessageUrl', () => {
  it('builds a private-channel deep link from a -100 chat id', () => {
    expect(telegramMessageUrl(-1003984566627, 2)).toBe('https://t.me/c/3984566627/2')
  })

  it('returns null when message id is missing', () => {
    expect(telegramMessageUrl(-1003984566627, null)).toBeNull()
  })
})
