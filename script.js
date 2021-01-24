function backgroundElem(elem) {
  let bg = document.getElementById('background');
  bg.appendChild(elem);
}

const dpr = window.devicePixelRatio || 1;
const fps = 24;

class RenderedLayer {
  constructor(file) {
    this.name = file.name;
    this.ready = false;

    this.total_time = 0;
    this.start_time = 0;

    this.width = 0;
    this.height = 0;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    backgroundElem(this.canvas);
  }

  resize() {
    this.thumb_canvas.width = this.thumb_canvas.clientWidth * dpr;
    this.thumb_canvas.height = this.thumb_canvas.clientHeight * dpr;
  }

  show_preview(ref_time) {
    if (!this.ready) {
      return;
    }
    this.thumb_ctx.clearRect(0, 0, this.thumb_canvas.clientWidth, this.thumb_canvas.clientHeight);
    this.thumb_ctx.scale(dpr, dpr);
    this.render(this.thumb_ctx, ref_time);
  }

  setup_preview() {
    let delete_option = document.createElement('a');
    delete_option.textContent = '[x]';
    delete_option.style.float = "right";
    delete_option.addEventListener('click', (function() {
      if (confirm("delete layer \"" + this.name + "\"?")) {
        this.player.remove(this);
      }
    }).bind(this));
    this.title_div.appendChild(delete_option);
    const description = document.createElement('div');
    description.classList.toggle('description');
    description.textContent = "\"" + this.name + "\"";
    description.addEventListener('click', (function(e) {
      const new_text = prompt("enter new text");
      if (new_text) {
        this.name = new_text;
        description.textContent = "\"" + this.name + "\"";
      }
    }).bind(this));
    this.title_div.appendChild(description);
  }

  init(player, preview) {
    this.player = player;
    this.preview = preview;
    this.canvas.width = this.player.width;
    this.canvas.height = this.player.height;
    this.title_div = this.preview.querySelector('.preview_title');
    this.thumb_canvas = this.preview.querySelector('.preview_thumb');
    this.thumb_ctx = this.thumb_canvas.getContext('2d');
    this.thumb_ctx.scale(dpr, dpr);
    this.setup_preview();
  }

  render_time(ctx, y_coord, width, selected) {
    let scale = ctx.canvas.clientWidth / this.player.total_time;
    let start = scale * this.start_time;
    let length = scale * this.total_time;
    if (selected) {
      ctx.fillStyle = `rgb(210,210,210)`;
    } else {
      ctx.fillStyle = `rgb(110,110,110)`;
    }
    ctx.fillRect(start, y_coord - width / 2, length, width);
    let end_width = width * 6;
    let tab_width = 2;
    ctx.fillRect(start, y_coord - end_width / 2, tab_width, end_width);
    ctx.fillRect(start + length - tab_width / 2, y_coord - end_width / 2, tab_width, end_width);
  }

  // default ignore drags, pinches
  update(change, time) {
    return;
  }

  drawScaled(ctx, ctx_out, video = false) {
    const width = video ? ctx.videoWidth : ctx.canvas.clientWidth;
    const height = video ? ctx.videoHeight : ctx.canvas.clientHeight;
    const in_ratio = width / height;
    const out_ratio = ctx_out.canvas.clientWidth / ctx_out.canvas.clientHeight;
    let ratio = 1;
    let offset_width = 0;
    let offset_height = 0;
    if (in_ratio > out_ratio) { // video is wider
      // match width
      ratio = ctx_out.canvas.clientWidth / width;
      offset_height = (ctx_out.canvas.clientHeight - (ratio * height)) / 2;
    } else { // out is wider
      // match height
      ratio = ctx_out.canvas.clientHeight / height;
      offset_width = (ctx_out.canvas.clientWidth - (ratio * width)) / 2;
    }
    ctx_out.drawImage((video ? ctx : ctx.canvas),
      0, 0, width, height,
      offset_width, offset_height, ratio * width, ratio * height);
  }
}

class MoveableLayer extends RenderedLayer {
  constructor(file) {
    super(file);
    // all moveables 2 seconds default
    this.total_time = 2 * 1000;
    this.frames = [];
    for (let i = 0; i < (this.total_time / 1000) * fps; ++i) {
      // x, y, scale, rot, anchor(bool)
      let f = new Float32Array(5);
      f[2] = 1;
      this.frames.push(f);
    }
    this.frames[0][4] = 1;
  }

  adjustTotalTime(diff) {
    this.total_time += diff;
    const num_frames = Math.floor((this.total_time / 1000) * fps - this.frames.length);
    const anchor = this.nearestAnchor(this.total_time, false);
    if (num_frames > 0) {
      for (let i = 0; i < num_frames; ++i) {
        let f = new Float32Array(5);
        f[2] = 1;
        this.frames.push(f);
      }
    } else if (num_frames < 0) {
      // prevent overflow
      this.frames.splice(this.frames.length + num_frames + 1, 1 - num_frames);
    }
    this.updateInterpolation(anchor);
  }

  anchor(index) {
    let f = this.frames[index];
    f[3] = 1;
  }

  // set index, k (of x, y, scale, rot) to val
  interpolate(index, k, val) {
    let f = this.frames[index];
    // find prev anchor
    let prev_idx = 0;
    let prev_val = val;
    let next_idx = this.frames.length - 1;
    let next_val = val;

    for (let i = index - 1; i >= 0; i--) {
      let prev = this.frames[i];
      if (prev[3]) {
        prev_idx = i;
        prev_val = prev[k];
        break;
      }
    }

    for (let i = index + 1; i < this.frames.length; ++i) {
      let next = this.frames[i];
      if (next[3]) {
        next_idx = i;
        next_val = next[k];
        break;
      }
    }

    let prev_range = index - prev_idx;
    const eps = 1e-9;
    for (let i = 0; i <= prev_range; ++i) {
      let s = i / (prev_range + eps);
      let v = (1 - s) * val + s * prev_val;
      this.frames[index - i][k] = v;
    }
    let next_range = next_idx - index;
    for (let i = 0; i <= next_range; ++i) {
      let s = i / (next_range + eps);
      let v = (1 - s) * val + s * next_val;
      this.frames[index + i][k] = v;
    }

  }

  updateInterpolation(index) {
    index = Math.max(index, 0);
    let f = this.frames[index];
    this.interpolate(index, 0, f[0]);
    this.interpolate(index, 1, f[1]);
    this.interpolate(index, 2, f[2]);
  }

  getIndex(ref_time) {
    let time = ref_time - this.start_time;
    let index = Math.floor(time / 1000 * fps);
    return index;
  }

  getTime(index) {
    return (index / fps * 1000) + this.start_time;
  }

  getFrame(ref_time) {
    let index = this.getIndex(ref_time);
    if (index < 0 || index >= this.frames.length) {
      return null;
    }
    return this.frames[index];
  }

  deleteAnchor(ref_time) {
    let i = this.getIndex(ref_time);
    this.frames[i][3] = 0;
    let prev_i = this.nearestAnchor(ref_time, false);
    this.updateInterpolation(prev_i);
  }

  update(change, ref_time) {
    let f = this.getFrame(ref_time);
    if (!f) {
      return;
    }
    let index = this.getIndex(ref_time);
    if (change.scale) {
      this.anchor(index);
      const old_scale = f[2];
      const new_scale = f[2] * change.scale;
      let delta_x = ((this.width * old_scale) - (this.width * new_scale)) / 2;
      let delta_y = ((this.height * old_scale) - (this.height * new_scale)) / 2;
      this.interpolate(index, 2, new_scale);
      this.interpolate(index, 0, f[0] + delta_x);
      this.interpolate(index, 1, f[1] + delta_y);
    }
    if (change.x) {
      this.anchor(index);
      this.interpolate(index, 0, change.x);
    }
    if (change.y) {
      this.anchor(index);
      this.interpolate(index, 1, change.y);
    }
  }

  // moveable layers have anchor points we'll want to show
  render_time(ctx, y_coord, base_width, selected) {
    super.render_time(ctx, y_coord, base_width, selected);
    let scale = ctx.canvas.clientWidth / this.player.total_time;
    let width = 4 * base_width;
    for (let i = 0; i < this.frames.length; ++i) {
      let f = this.frames[i];
      if (f[3]) {
        let anchor_x = this.start_time + 1000 * (i / fps);
        ctx.fillStyle = `rgb(100,210,255)`;
        ctx.fillRect(scale * anchor_x, y_coord - width / 2, 3, width);
      }
    }
  }

  nearestAnchor(time, fwd) {
    if (this.getFrame(time)) {
      let i = this.getIndex(time);
      let inc = function() {
        if (fwd) {
          i++;
        } else {
          i--;
        }
      };
      inc();
      while (i >= 0 && i < this.frames.length) {
        if (this.frames[i][3]) {
          return i;
        }
        inc();
      }
    }
    return -1;
  }
}

class ImageLayer extends MoveableLayer {
  constructor(file) {
    super(file);
    // assume images are 10 seconds
    this.img = new Image();

    this.reader = new FileReader();
    this.reader.addEventListener("load", (function() {
      this.img.src = this.reader.result;
      this.img.addEventListener('load', (function() {
        this.width = this.img.naturalWidth;
        this.height = this.img.naturalHeight;
        this.ready = true;
      }).bind(this));
    }).bind(this), false);
    this.reader.readAsDataURL(file);
  }

  render(ctx_out, ref_time) {
    if (!this.ready) {
      return;
    }
    let f = this.getFrame(ref_time);
    if (f) {
      let scale = f[2];
      let x = f[0] + this.canvas.width / 2 - this.width / 2;
      let y = f[1] + this.canvas.height / 2 - this.height / 2;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.img, 0, 0, this.width, this.height, x, y, scale * this.canvas.width, scale * this.canvas.height);
      this.drawScaled(this.ctx, ctx_out);
    }
  }
}

class TextLayer extends MoveableLayer {
  constructor(text) {
    let f = {
      name: text
    };
    super(f);
    this.color = "#ffffff";
    this.ready = true;
  }

  init(player, preview) {
    super.init(player, preview);
    let color_picker = document.createElement('input');
    color_picker.type = "color";
    color_picker.value = this.color;
    this.title_div.appendChild(color_picker);
    color_picker.addEventListener('change', (function(e) {
      this.color = e.target.value;
    }).bind(this));
  }

  render(ctx_out, ref_time) {
    let f = this.getFrame(ref_time);
    if (f) {
      let scale = f[2];
      this.ctx.font = Math.floor(scale * 30) + "px Georgia";
      let rect = this.ctx.measureText(this.name);
      this.width = rect.width;
      this.height = rect.actualBoundingBoxAscent + rect.actualBoundingBoxDescent;
      let x = f[0] + this.canvas.width / 2;
      let y = f[1] + this.canvas.height / 2;
      this.ctx.shadowColor = "black";
      this.ctx.shadowBlur = 7;
      this.ctx.fillStyle = this.color;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillText(this.name, x, y);
      this.drawScaled(this.ctx, ctx_out);
    }
  }
}

class VideoLayer extends RenderedLayer {
  constructor(file) {
    super(file);

    // assume all videos fit in 1GB of ram
    this.max_size = 1000 * 1e6 / 4; // 1GB max
    this.video = document.createElement('video');
    this.video.setAttribute('autoplay', true);
    this.video.setAttribute('loop', true);
    this.video.setAttribute('playsinline', true);
    this.video.setAttribute('muted', true);
    this.video.setAttribute('controls', true);
    this.frames = [];
    backgroundElem(this.video);

    this.reader = new FileReader();
    this.reader.addEventListener("load", (function() {
      this.video.addEventListener('loadedmetadata', (function() {
        let width = this.video.videoWidth;
        let height = this.video.videoHeight;
        let dur = this.video.duration;
        this.total_time = dur * 1000;
        let size = fps * dur * width * height;
        if (size < this.max_size) {
          this.width = width;
          this.height = height;
        } else {
          let scale = size / this.max_size;
          this.width = Math.floor(width / scale);
          this.height = Math.floor(height / scale);
        }
        const player_ratio = this.player.width / this.player.height;
        const video_ratio = this.width / this.height;
        if (video_ratio > player_ratio) { // video is wider, make it taller
          let scale = video_ratio / player_ratio;
          this.height *= scale;
        } else {
          let scale = player_ratio / video_ratio;
          this.width *= scale;
        }
        this.canvas.height = this.height;
        this.canvas.width = this.width;
        this.convertToArrayBuffer();
      }).bind(this));
      this.video.src = this.reader.result;
    }).bind(this), false);
    this.reader.readAsDataURL(file);
  }

  async seek(t) {
    return await (new Promise((function(resolve, reject) {
      this.video.currentTime = t;
      this.video.pause();
      this.video.addEventListener('seeked', (function(ev) {
        this.drawScaled(this.video, this.ctx, true);
        this.thumb_canvas.width = this.thumb_canvas.clientWidth * dpr;
        this.thumb_canvas.height = this.thumb_canvas.clientHeight * dpr;
        this.thumb_ctx.clearRect(0, 0, this.thumb_canvas.clientWidth, this.thumb_canvas.clientHeight);
        this.thumb_ctx.scale(dpr, dpr);
        this.drawScaled(this.ctx, this.thumb_ctx);
        let frame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        resolve(frame);
      }).bind(this), {
        once: true
      });
    }).bind(this)));
  }

  async convertToArrayBuffer() {
    this.video.pause();
    let d = this.video.duration;
    for (let i = 0; i < d * fps; ++i) {
      let frame = await this.seek(i / fps);
      let sum = 0;
      for (let j = 0; j < frame.data.length; ++j) {
        sum += frame.data[j];
      }
      this.frames.push(frame);
      this.title_div.textContent = (100 * i / (d * fps)).toFixed(2) + "%";
    }
    this.ready = true;
    this.video.remove();
    this.video = null;
    this.title_div.innerHTML = "";
    this.setup_preview();
  }

  render(ctx_out, ref_time) {
    if (!this.ready) {
      return;
    }
    let time = ref_time - this.start_time;
    let index = Math.floor(time / 1000 * fps);
    if (index < this.frames.length) {
      const frame = this.frames[index];
      this.ctx.putImageData(frame, 0, 0);
      this.drawScaled(this.ctx, ctx_out);
    }
  }
}

var AudioContext = window.AudioContext // Default
  ||
  window.webkitAudioContext // Safari and old versions of Chrome
  ||
  false;
class AudioLayer extends RenderedLayer {
  constructor(file) {
    super(file);
    this.reader = new FileReader();
    this.audio_ctx = new AudioContext();
    this.audio_buffer = null;
    this.source = null;
    this.playing = false;
    this.last_time = 0;
    this.last_ref_time = 0;
    this.reader.addEventListener("load", (function() {
      let buffer = this.reader.result;
      this.audio_ctx.decodeAudioData(buffer, (aud_buffer) => {
        this.audio_buffer = aud_buffer;
        this.total_time = this.audio_buffer.duration * 1000;
        if (this.total_time === 0) {
          this.player.remove(this);
        }
        this.ready = true;
      }, (function(e) {
        this.player.remove(this);
      }).bind(this));
    }).bind(this));
    this.reader.readAsArrayBuffer(file);
  }

  init_audio() {
    if (this.source) {
      this.source.disconnect(this.audio_ctx.destination);
    }
    this.source = this.audio_ctx.createBufferSource();
    this.source.buffer = this.audio_buffer;
    this.source.connect(this.audio_ctx.destination);
    this.source.onended = (function() {
      this.playing = false;
    }).bind(this);
  }

  init(player, preview) {
    super.init(player, preview);
    const description = this.title_div.querySelector('.description');
    description.textContent = "\"" + this.name + "\" [audio]";
  }

  render(ctx_out, ref_time) {
    if (!this.ready) {
      return;
    }
    if (!this.player.playing) {
      if (this.playing) {
        this.audio_ctx.suspend();
      }
      this.playing = false;
      return;
    }

    let time = ref_time - this.start_time;
    if (time < 0 || time > this.total_time) {
      return;
    }
    let restart = false;
    const now = window.performance.now();
    if (this.player.playing) {
      // we have to start it up again
      if (this.playing == false) {
        restart = true;
      }
      const diff_t = ref_time - this.last_ref_time;
      const diff_l = this.last_time - now;
      if (Math.abs(diff_l - diff_t) > 100) {
        restart = true;
      }
    }
    this.last_time = now;
    this.last_ref_time = ref_time;
    if (restart) {
      if (!this.source ||
        (this.source.playbackState == this.source.FINISHED_STATE) ||
        (this.source.playbackState == this.source.PLAYING_STATE) ||
        (this.source.playbackState == this.source.SCHEDULED_STATE)) {
        this.init_audio();
      }
      this.audio_ctx.resume();
      this.source.start(0, time / 1000);
      this.playing = true;
    }
  }
};

class Player {

  constructor() {
    this.playing = false;
    this.scrubbing = false;
    this.layers = [];
    this.selected_layer = null;
    this.onend_callback = null;
    this.update = null;
    this.width = 1280 / 2;
    this.height = 720 / 2;
    this.total_time = 0;
    this.last_step = null;
    this.time = 0;
    // for preview
    this.aux_time = 0;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas_holder = document.getElementById('canvas');
    this.canvas_holder.appendChild(this.canvas);
    this.time_holder = document.getElementById('time');
    this.time_canvas = document.createElement('canvas');
    this.time_canvas.addEventListener('mousedown', this.scrubStart.bind(this));
    this.time_canvas.addEventListener('mousemove', this.scrubMove.bind(this));
    this.time_canvas.addEventListener('mouseleave', this.scrubEnd.bind(this));
    this.time_ctx = this.time_canvas.getContext('2d');
    this.time_holder.appendChild(this.time_canvas);
    this.cursor_preview = document.getElementById('cursor_preview');
    this.cursor_canvas = this.cursor_preview.querySelector('canvas');
    this.cursor_ctx = this.cursor_canvas.getContext('2d');
    this.cursor_text = this.cursor_preview.querySelector('div');
    window.requestAnimationFrame(this.loop.bind(this));

    this.setupPinchHadler();
    this.setupDragHandler();
    this.resize();
  }

  intersectsTime(time, query) {
    if (!query) {
      query = this.time;
    }
    return Math.abs(query - time) / this.total_time < 0.01;
  }

  init_audio() {
    for (let layer of this.layers) {
      if (layer instanceof AudioLayer) {
        layer.init_audio();
      }
    }
  }

  scrubStart(ev) {
    this.scrubbing = true;
    let rect = this.time_holder.getBoundingClientRect();
    this.time = ev.offsetX / rect.width * this.total_time;

    window.addEventListener('mouseup', this.scrubEnd.bind(this), {
      once: true
    });

    let y_inc = this.time_canvas.clientHeight / (this.layers.length + 1);
    let y_coord = this.time_canvas.clientHeight;
    let mouseover = false;
    for (let layer of this.layers) {
      y_coord -= y_inc;
      if (layer.start_time > (1.01 * this.time)) {
        continue;
      }
      if (layer.start_time + layer.total_time < (0.99 * this.time)) {
        continue;
      }
      if (Math.abs(ev.offsetY - y_coord) < (0.05 * this.time_canvas.clientHeight)) {
        this.select(layer);
        mouseover = true;
      }
    }

    // can't drag unselected
    if (!this.selected_layer || !mouseover) {
      return;
    }

    // dragging something
    let l = this.selected_layer;

    if (this.intersectsTime(l.start_time)) {
      this.time = l.start_time;
      let base_t = this.time;
      this.dragging = function(t) {
        let diff = t - base_t;
        base_t = t;
        if (l instanceof MoveableLayer) {
          let diff = l.start_time - t;
          l.adjustTotalTime(diff);
          l.start_time -= diff;
        } else {
          l.start_time += diff;
        }
      }
    } else if (this.intersectsTime(l.start_time + l.total_time)) {
      this.time = l.start_time + l.total_time;
      let base_t = this.time;
      this.dragging = function(t) {
        let diff = t - base_t;
        base_t = t;
        if (l instanceof MoveableLayer) {
          l.adjustTotalTime(diff);
        } else {
          l.start_time += diff;
        }
      }
    } else if (this.time < l.start_time + l.total_time && this.time > l.start_time) {
      let base_t = this.time;
      this.dragging = function(t) {
        let diff = t - base_t;
        base_t = t;
        l.start_time += diff;
      }
    }
  }

  scrubMove(ev) {
    let rect = this.time_holder.getBoundingClientRect();
    let time = ev.offsetX / rect.width * this.total_time;

    document.body.style.cursor = "default";

    if (this.selected_layer) {
      let l = this.selected_layer;
      if (this.intersectsTime(l.start_time, time)) {
        document.body.style.cursor = "col-resize";
      }
      if (this.intersectsTime(l.start_time + l.total_time, time)) {
        document.body.style.cursor = "col-resize";
      }
    }

    this.cursor_preview.style.display = "block";
    let cursor_x = Math.max(ev.clientX - this.cursor_canvas.clientWidth / 2, 0);
    cursor_x = Math.min(cursor_x, rect.width - this.cursor_canvas.clientWidth);
    this.cursor_preview.style.left = cursor_x + "px";
    this.cursor_preview.style.bottom = (rect.height) + "px";

    this.aux_time = time;
    this.cursor_text.textContent = this.aux_time.toFixed(2) + "/" + this.total_time.toFixed(2)


    if (this.scrubbing) {
      this.time = time;
    }

    if (this.dragging) {
      this.dragging(this.time);
    }
  }

  scrubEnd(ev) {
    document.body.style.cursor = "default";
    this.cursor_preview.style.display = "none";
    this.scrubbing = false;
    this.dragging = null;
    this.total_time = 0;
    this.aux_time = 0;
  }

  setupPinchHadler() {
    let elem = this.canvas_holder;

    let callback = (function(scale, rotation) {
      this.update = {
        scale: scale,
        rotation: rotation
      };
    }).bind(this);

    // safari only
    let gestureStartRotation = 0;
    let gestureStartScale = 0;

    let wheel = function(e) {
      e.preventDefault();
      if (e.ctrlKey || e.shiftKey) {
        let delta = e.deltaY;
        if (!Math.abs(delta) && e.deltaX != 0) {
          delta = e.deltaX * 0.5;
        }
        let scale = 1;
        scale -= delta * 0.01;
        // Your zoom/scale factor
        callback(scale, 0);
      }
    }
    // safari
    let gesturestart = function(e) {
      e.preventDefault();
      gestureStartRotation = e.rotation;
      gestureStartScale = e.scale;
    };
    let gesturechange = function(e) {
      e.preventDefault();
      let rotation = e.rotation - gestureStartRotation;
      let scale = e.scale / gestureStartScale;
      gestureStartRotation = e.rotation;
      gestureStartScale = e.scale;
      callback(scale, rotation);
    };
    let gestureend = function(e) {
      e.preventDefault();
    };
    elem.addEventListener('gesturestart', gesturestart.bind(this));
    elem.addEventListener('gesturechange', gesturechange.bind(this));
    elem.addEventListener('gestureend', gestureend.bind(this));
    // everyone else
    elem.addEventListener('wheel', wheel.bind(this), {
      passive: false
    });
    let deleter = function() {
      elem.removeEventListener('gesturestart', gesturestart);
      elem.removeEventListener('gesturechange', gesturechange);
      elem.removeEventListener('gestureend', gestureend);
      elem.removeEventListener('wheel', wheel);
    }
  }

  setupDragHandler() {
    let callback = (function(x, y) {
      this.update = {
        x: x,
        y: y
      };
    }).bind(this);
    let elem = this.canvas_holder;
    let dragging = false;
    let base_x = 0;
    let base_y = 0;
    let mouseup = function(e) {
      dragging = false;
      e.preventDefault();
    }
    let get_ratio = (function(elem) {
      let c_ratio = elem.clientWidth / elem.clientHeight;
      let target_ratio = this.width / this.height;
      // how many player pixels per client pixels
      let ratio = 1;
      if (c_ratio > target_ratio) { // client is wider than player
        ratio = this.height / elem.clientHeight;
      } else {
        ratio = this.width / elem.clientWidth;
      }
      return ratio;
    }).bind(this);
    let mousedown = function(e) {
      if (!this.selected_layer) {
        return;
      }
      if (!(this.selected_layer instanceof MoveableLayer)) {
        return;
      }
      e.preventDefault();
      let f = this.selected_layer.getFrame(this.time);
      if (!f) {
        return;
      }
      dragging = true;
      base_x = e.offsetX * get_ratio(e.target) - f[0];
      base_y = e.offsetY * get_ratio(e.target) - f[1];
      window.addEventListener('mouseup', mouseup, {
        once: true
      });
    }
    let mousemove = function(e) {
      if (dragging) {
        let dx = e.offsetX * get_ratio(e.target) - base_x;
        let dy = e.offsetY * get_ratio(e.target) - base_y;
        callback(dx, dy);
      }
    }
    elem.addEventListener('mousedown', mousedown.bind(this));
    elem.addEventListener('mousemove', mousemove.bind(this));
    let deleter = function() {
      elem.removeEventListener('mousedown', mousedown);
      elem.removeEventListener('mousemove', mousemove);
    }
  }

  prev() {
    if (this.selected_layer) {
      let l = this.selected_layer;
      if (l instanceof MoveableLayer) {
        let i = l.nearestAnchor(this.time, false);
        if (i >= 0) {
          this.time = l.getTime(i);
          return;
        }
      }
    }
    this.time = Math.max(this.time - 100, 0);
  }

  next() {
    if (this.selected_layer) {
      let l = this.selected_layer;
      if (l instanceof MoveableLayer) {
        let i = l.nearestAnchor(this.time, true);
        if (i >= 0) {
          this.time = l.getTime(i);
          return;
        }
      }
    }
    this.time = Math.min(this.time + 100, this.total_time - 1);
  }

  deleteAnchor() {
    if (this.selected_layer) {
      let l = this.selected_layer;
      if (l instanceof MoveableLayer) {
        l.deleteAnchor(this.time);
        this.prev();
      }
    }
  }

  deselect() {
    if (this.selected_layer !== null) {
      this.selected_layer.preview.classList.toggle('selected');
    }
  }

  select(layer) {
    this.deselect();
    this.selected_layer = layer;
    this.selected_layer.preview.classList.toggle('selected');
  }

  remove(layer) {
    const idx = this.layers.indexOf(layer);
    const len = this.layers.length;
    if (idx > -1) {
      this.layers.splice(idx, 1);
      let layer_picker = document.getElementById('layers');
      // divs are reversed
      layer_picker.children[len - idx - 1].remove();
    }
    this.total_time = 0;
  }

  add(layer) {
    let layer_picker = document.getElementById('layers');
    let preview = document.createElement('div');
    let thumb = document.createElement('canvas');
    let title = document.createElement('div');
    preview.classList.toggle('preview');

    preview.setAttribute('draggable', true);
    preview.addEventListener('dragstart', (function(ev) {
      this.preview_dragging = preview;
      this.preview_dragging_layer = layer;
    }).bind(this));
    preview.addEventListener('dragover', function(ev) {
      ev.preventDefault();
    });
    preview.addEventListener('drop', (function(ev) {
      preview.before(this.preview_dragging);
      let idx = this.layers.indexOf(this.preview_dragging_layer);
      if (idx > -1) {
        this.layers.splice(idx, 1);
      }
      let new_idx = this.layers.indexOf(layer);
      this.layers.splice(new_idx + 1, 0, this.preview_dragging_layer);
      this.select(this.preview_dragging_layer);
      this.preview_dragging = null;
      this.preview_dragging_layer = null;
    }).bind(this));

    preview.addEventListener('click', (function() {
      this.select(layer);
    }).bind(this));
    thumb.classList.toggle('preview_thumb');
    title.classList.toggle('preview_title');
    preview.appendChild(thumb);
    preview.appendChild(title);
    layer_picker.prepend(preview);
    layer.start_time = this.time;
    layer.init(this, preview);
    this.layers.push(layer);
    this.select(layer);
  }

  onend(callback) {
    this.onend_callback = callback;
  }

  render(ctx, time, update_preview) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let layer of this.layers) {
      if (layer.start_time > time) {
        continue;
      }
      if (layer.start_time + layer.total_time < time) {
        continue;
      }
      layer.render(ctx, time);
      if (update_preview) {
        layer.show_preview(time);
      }
    }
  }

  resize() {
    // update canvas and time sizes
    {
      this.canvas.width = this.canvas.clientWidth * dpr;
      this.canvas.height = this.canvas.clientHeight * dpr;
      this.ctx.scale(dpr, dpr);
    } {
      this.time_canvas.width = this.time_canvas.clientWidth * dpr;
      this.time_canvas.height = this.time_canvas.clientHeight * dpr;
      this.time_ctx.scale(dpr, dpr);
    }
    for (let layer of this.layers) {
      layer.resize();
    }
  }

  loop(realtime) {

    for (let layer of this.layers) {
      if (layer.start_time + layer.total_time > this.total_time) {
        this.total_time = layer.start_time + layer.total_time;
      }
    }
    // draw time
    if (this.last_step === null) {
      this.last_step = realtime;
    }
    if (this.playing && this.total_time > 0) {
      this.time += (realtime - this.last_step);
      if (this.onend_callback && this.time >= this.total_time) {
        this.onend_callback(this);
        this.onend_callback = null;
      }
      this.time %= this.total_time;
    }
    this.last_step = realtime;
    this.time_ctx.clearRect(0, 0, this.time_canvas.clientWidth, this.time_canvas.clientWidth);
    let x = this.time_canvas.clientWidth * this.time / this.total_time;
    this.time_ctx.fillStyle = `rgb(210,210,210)`;
    this.time_ctx.fillRect(x, 0, 2, this.time_canvas.clientHeight);
    this.time_ctx.font = "10px courier";
    this.time_ctx.fillText(this.time.toFixed(2), 5, 10);
    this.time_ctx.fillText(this.total_time.toFixed(2), 5, 20);

    if (this.aux_time > 0) {
      let aux_x = this.time_canvas.clientWidth * this.aux_time / this.total_time;
      this.time_ctx.fillStyle = `rgb(110,110,110)`;
      this.time_ctx.fillRect(aux_x, 0, 1, this.time_canvas.clientHeight);
      this.render(this.cursor_ctx, this.aux_time, false);
    }

    let y_inc = this.time_canvas.clientHeight / (this.layers.length + 1);
    let y_coord = this.time_canvas.clientHeight - y_inc;
    for (let layer of this.layers) {
      let selected = this.selected_layer == layer;
      layer.render_time(this.time_ctx, y_coord, 3, selected);
      y_coord -= y_inc;
      if (this.selected_layer == layer && this.update) {
        layer.update(this.update, this.time);
        this.update = null;
      }
    }
    this.render(this.ctx, this.time, true);
    window.requestAnimationFrame(this.loop.bind(this));
  }

}


let player = new Player();

function addFile(file) {
  if (file.type.indexOf('video') >= 0) {
    //player.add(new AudioLayer(file));
    player.add(new VideoLayer(file));
  } else if (file.type.indexOf('image') >= 0) {
    player.add(new ImageLayer(file));
  }
}

async function addURI(uri) {
  // safari has a bug here
  if (!uri) {
    return;
  }
  let response = await fetch(uri);
  let data = await response.blob();
  let extension = uri.split(/[#?]/)[0].split('.').pop().trim();
  // todo: add more types
  const ext_map = {
    'mp4': 'video/mp4',
    'mpeg4': 'video/mp4',
    'mpeg': 'video/mpeg',
    'ogv': 'video/ogg',
    'webm': 'video/webm',
    'gif': 'image/gif',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
  };
  let metadata = {
    type: ext_map[extension]
  };
  let segs = uri.split("/");
  let name = segs[segs.length - 1];
  let file = new File([data], name, metadata);
  addFile(file);
}

window.addEventListener('drop', function(ev) {
  ev.preventDefault();
  if (ev.dataTransfer.items) {
    for (var i = 0; i < ev.dataTransfer.items.length; i++) {
      let item = ev.dataTransfer.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        addFile(file);
      } else if (item.kind === 'string' && item.type === 'text/uri-list') {
        item.getAsString(addURI);
      }
    }
  }
});

window.addEventListener('paste', function(ev) {
  let uri = (event.clipboardData || window.clipboardData).getData('text');
  addURI(uri);
});

// TODO show something
window.addEventListener('dragover', function(e) {
  e.preventDefault();
});


window.addEventListener('keydown', function(ev) {
  if (ev.code == "Space") {
    player.playing = !player.playing;
    player.init_audio();
  } else if (ev.code == "ArrowLeft") {
    player.prev();
  } else if (ev.code == "ArrowRight") {
    player.next();
  } else if (ev.code == "Backspace") {
    player.deleteAnchor();
  } else if (ev.code == "KeyI") {
    if (ev.ctrlKey) {
      let uris = prompt("paste comma separated list of URLs").replace(/ /g, '');
      let encoded = encodeURIComponent(uris);
      location.hash = encoded;
    }
  }
});

window.addEventListener('load', function() {
  if (location.hash) {
    let l = decodeURIComponent(location.hash.substring(1));
    for (let uri of l.split(',')) {
      addURI(uri);
    }
    location.hash = "";
    return;
  }
  let localStorage = window.localStorage;
  let seen = localStorage.getItem('_seen');
  if (!seen || false) {
    const div = document.createElement('div');
    const close = document.createElement('a');
    const text = document.createElement('p');
    const vid = document.createElement('video');
    close.addEventListener('click', function() {
      div.remove();
    });
    close.textContent = "[x]";
    close.id = "close";
    text.innerHTML = `welcome!
      <br>
      <br>
      to start, drag in or paste URLs to videos and images.
      <br>
      more information and a demo can be found <a href="https://github.com/bwasti/mebm" target="_blank">here</a>
      `;
    vid.src = "https://github.com/bwasti/mebm/blob/main/README_assets/usage.mp4?raw=true";
    vid.setAttribute('autoplay', true);
    vid.setAttribute('loop', true);
    vid.setAttribute('playsinline', true);
    vid.setAttribute('muted', true);
    vid.style.width = '100%';
    div.appendChild(close);
    div.appendChild(text);
    // TODO: consider adding back
    //div.appendChild(vid);
    div.classList.toggle('popup');
    document.body.appendChild(div);
    localStorage.setItem('_seen', 'true');
  }
});

window.addEventListener('beforeunload', function() {
  return true;
});

window.addEventListener('resize', function() {
  player.resize();
});

function add_text() {
  let t = prompt("enter text");
  player.add(new TextLayer(t));
}

function exportVideo(blob) {
  const vid = document.createElement('video');
  vid.controls = true;
  vid.src = URL.createObjectURL(blob);
  backgroundElem(vid);
  let extension = blob.type.split(';')[0].split('/')[1];

  function make_a() {
    let h = document.getElementById('header');
    let a = h.querySelector('#download');
    if (!a) {
      a = document.createElement('a');
      a.id = 'download';
      a.download = (new Date()).getTime() + '.' + extension;
      a.textContent = 'download';
    }
    a.href = vid.src;
    document.getElementById('header').appendChild(a);
  }
  vid.ontimeupdate = function() {
    this.ontimeupdate = () => {
      return;
    }
    make_a();
    vid.currentTime = 0;
  }
  make_a();
  vid.currentTime = Number.MAX_SAFE_INTEGER;
}

function upload() {
  let f = document.getElementById('filepicker');
  f.addEventListener('input', function(e) {
    for (let file of e.target.files) {
      addFile(file);
    }
    f.value = '';
  });
  f.click();
}

function getSupportedMimeTypes() {
  const VIDEO_TYPES = [
    "webm",
    "ogg",
    "mp4",
    "x-matroska"
  ];
  const VIDEO_CODECS = [
    "vp9",
    "vp9.0",
    "vp8",
    "vp8.0",
    "avc1",
    "av1",
    "h265",
    "h.265",
    "h264",
    "h.264",
    "opus",
  ];

  const supportedTypes = [];
  VIDEO_TYPES.forEach((videoType) => {
    const type = `video/${videoType}`;
    VIDEO_CODECS.forEach((codec) => {
      const variations = [
        `${type};codecs=${codec}`,
        `${type};codecs:${codec}`,
        `${type};codecs=${codec.toUpperCase()}`,
        `${type};codecs:${codec.toUpperCase()}`
      ]
      variations.forEach(variation => {
        if (MediaRecorder.isTypeSupported(variation))
          supportedTypes.push(variation);
      })
    });
    if (MediaRecorder.isTypeSupported(type)) supportedTypes.push(type);
  });
  return supportedTypes;
}

function download() {
  if (player.layers.length == 0) {
    alert("nothing to export");
    return;
  }
  const e = document.getElementById('export');
  const e_text = e.textContent;
  e.textContent = "exporting...";
  const chunks = [];
  const stream = player.canvas.captureStream();
  for (let layer of player.layers) {
    if (layer instanceof AudioLayer) {
      let dest = layer.audio_ctx.createMediaStreamDestination();
      layer.source.connect(dest);
      let tracks = dest.stream.getAudioTracks();
      for (let track of tracks) {
        stream.addTrack(track);
      }
    }
  }
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = e => chunks.push(e.data);
  const available_types = getSupportedMimeTypes();
  if (available_types.length == 0) {
    alert("cannot export! please use a screen recorder instead");
  }
  rec.onstop = e => exportVideo(new Blob(chunks, {
    type: available_types[0],
  }));
  player.time = 0;
  player.playing = true;
  rec.start();
  player.onend(function(p) {
    rec.stop();
    e.textContent = e_text;
    player.playing = false;
    player.time = 0;
  });
}
