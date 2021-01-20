# mebm

mebm is a browser based video editor that supports animation of images and text overlays.
The animation is done with key-frames (denoted in blue on the timeline) and linear interpolation.

The design values simplicity and rudimentary functionality over a full feature set.
Audio is not yet supported, but is planned.

[>>> link <<<](http://bwasti.github.io/mebm)

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
