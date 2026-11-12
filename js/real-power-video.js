(function () {
  "use strict";

  const video = document.getElementById("real-power-install-video");
  const playButton = document.querySelector(".real-power-video-play");
  const errorMessage = document.querySelector(".real-power-video-error");

  if (!video || !playButton) return;

  function showError() {
    playButton.hidden = true;
    if (errorMessage) errorMessage.hidden = false;
  }

  video.addEventListener("error", showError);
  const source = video.querySelector("source");
  if (source) source.addEventListener("error", showError);

  if (!video.canPlayType("video/mp4") || video.error) {
    showError();
    return;
  }

  playButton.hidden = false;

  playButton.addEventListener("click", function () {
    playButton.hidden = true;
    if (errorMessage) errorMessage.hidden = true;
    video.focus({ preventScroll: true });

    const playback = video.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(function (error) {
        if (error.name === "AbortError") return;
        if (error.name === "NotAllowedError") {
          playButton.hidden = false;
        } else {
          showError();
        }
      });
    }
  });

  video.addEventListener("play", function () {
    playButton.hidden = true;
    if (errorMessage) errorMessage.hidden = true;
  });
})();
