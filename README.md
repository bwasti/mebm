# mebm

mebm is a browser based video editor that supports animation of images and text overlays.
The animation is done with key-frames (denoted in blue on the timeline) and linear interpolation.

The design values simplicity and rudimentary functionality over a full feature set.
Audio is not yet supported, but is planned.

[>>> link <<<](http://bwasti.github.io/mebm)

# usage

- space to pause/play
- select layers to manipulate them (click on the timeline or sidebar)
  - shift + scroll or pinch to zoom text and images
  - drag to move them
  - arrow keys to jump between keypoints
  - backspace to remove keypoints
- export by clicking "export"
  - let video play to completion
  - click "download" to grab a copy (.webm)
  
<p align="center">
<img src="https://github.com/bwasti/mebm/blob/main/README_assets/usage.gif?raw=true" width="70%">
  <br>output:<br>
<img src="https://github.com/bwasti/mebm/blob/main/README_assets/result.gif?raw=true" width="30%">
</p>
# todo

- timeline
  - [ ] allow extending beyond current max time (medium)
  - [ ] split at play head (medium)
  - [ ] mouseover preview safari fix (hard)
- file management
  - [ ] error on bad type (easy)
  - [ ] animated .gif support
- editing
  - [ ] undo (hard)
  - [ ] audio (hard)
  - [ ] face tracking (medium/easy)
  - [ ] opacity (easy)
  - [ ] rotation (medium)
- code
  - [ ] refactor/simplify MoveableLayer this.frames
  - [ ] make video a MoveableLayer
  - [ ] compress video frames
  - [ ] investigate memory use warning on safari
  - [ ] cache render output for thumbnails
  - [ ] move height/width setting logic out of render loop
  - [ ] improve text scaling logic (avoid font size, use ctx.scale)
