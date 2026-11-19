import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkVideoFile, youtubeEmbed, youtubeId } from './video.js'

test('reads the YouTube links people paste, and nothing else', () => {
  for (const s of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?si=x', 'youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=3',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ']) {
    assert.equal(youtubeId(s), 'dQw4w9WgXcQ', s)
  }
  for (const s of ['', 'https://vimeo.com/1', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=short', 'javascript:alert(1)']) assert.equal(youtubeId(s), '', s)
})

test('the home-slide player is silent, looping and without controls', () => {
  const u = new URL(youtubeEmbed('dQw4w9WgXcQ', { background: true }))
  assert.equal(u.hostname, 'www.youtube-nocookie.com')
  for (const [k, v] of [['autoplay', '1'], ['mute', '1'], ['controls', '0'], ['loop', '1'], ['playlist', 'dQw4w9WgXcQ']]) assert.equal(u.searchParams.get(k), v)
})

test('video files: MP4 and WebM up to 50 MB; .mov is refused with its own reason', () => {
  assert.equal(checkVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 1000 }), '')
  assert.equal(checkVideoFile({ name: 'a.webm', type: 'video/webm', size: 1000 }), '')
  assert.equal(checkVideoFile({ name: 'IMG_1.MOV', type: 'video/quicktime', size: 1000 }), 'video_mov')
  assert.equal(checkVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 60 * 1024 * 1024 }), 'video_too_big')
  assert.equal(checkVideoFile({ name: 'a.png', type: 'image/png', size: 10 }), 'video_invalid')
})
