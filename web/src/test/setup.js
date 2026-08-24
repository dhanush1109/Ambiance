/**
 * Shared jsdom setup.
 *
 * jsdom ships no media stack at all: HTMLMediaElement.play/pause/load push
 * "Not implemented" into the virtual console, which arrives as a console.error
 * and fails any test that asserts a clean console. The app is correct to call
 * play() — every real WebView has it — so the gap is in the environment, and
 * this closes it rather than loosening the assertion.
 *
 * Deliberately minimal: play() resolves, and nothing here simulates playback.
 * Tests that need a video to actually progress, stall or fail install their own
 * richer stub over the top (see launch.test.jsx).
 */
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function play() {
    return Promise.resolve()
  }
  HTMLMediaElement.prototype.pause = function pause() {}
  HTMLMediaElement.prototype.load = function load() {}
}
