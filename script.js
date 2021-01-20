function backgroundElem(elem) {
  let bg = document.getElementById('background');
  bg.appendChild(elem);
}

const fps = 20;
const click_tolerance = 0.05; // 5% tolerance

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

  show_preview(ref_time) {
    if (!this.ready) {
      return;
    }
    this.thumb_canvas.width = this.thumb_canvas.clientWidth;
    this.thumb_canvas.height = this.thumb_canvas.clientHeight;
    this.thumb_ctx.clearRect(0, 0, this.thumb_canvas.width, this.thumb_canvas.height);
    this.render(this.thumb_ctx, ref_time);
  }

  setup_preview() {
    let delete_option = document.createElement('a');
    delete_option.textContent = '[x]';
    delete_option.style.float = "right";
    delete_option.addEventListener('click', (function() {
      if (confirm("delete layer \""+this.name+"\"?")) {
        this.player.remove(this);
      }
    }).bind(this));
    this.title_div.appendChild(delete_option);
    const description = document.createElement('div');
    description.classList.toggle('description');
    description.textContent = "\"" + this.name + "\"";
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
    this.setup_preview();
  }

  render_time(ctx, y_coord, width, selected) {
    let scale = ctx.canvas.width / this.player.total_time;
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

  drawScaled(ctx, ctx_out) {
    let width = ctx.canvas.width;
    let height = ctx.canvas.height;
    let in_ratio = width / height;
    let out_ratio = ctx_out.canvas.width / ctx_out.canvas.height;
    let ratio = 1;
    let offset_width = 0;
    let offset_height = 0;
    if (in_ratio > out_ratio) { // video is wider
      // match width
      ratio = ctx_out.canvas.width / width;
      offset_height = (ctx_out.canvas.height - (ratio * height)) / 2;
    } else { // out is wider
      // match height
      ratio = ctx_out.canvas.height / height;
      offset_width = (ctx_out.canvas.width - (ratio * width)) / 2;
    }
    ctx_out.drawImage(ctx.canvas,
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
    let scale = ctx.canvas.width / this.player.total_time;
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
        this.ready = true;
        this.width = this.img.naturalWidth;
        this.height = this.img.naturalHeight;

      }).bind(this));
    }).bind(this), false);
    this.reader.readAsDataURL(file);
  }

  render(ctx_out, ref_time) {
    let f = this.getFrame(ref_time);
    if (f) {
      let scale = f[2];
      let x = f[0] + this.canvas.width / 2 - this.width / 2;
      let y = f[1] + this.canvas.height / 2 - this.height / 2;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.img, 0, 0, this.width, this.height, x, y, scale * this.width, scale * this.height);
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
    this.text = text;
    this.color = "#ffffff";
    this.ready = true;
  }

  init(player, preview) {
    super.init(player, preview);
    let description = this.title_div.querySelector('.description');
    description.addEventListener('click', (function(e) {
      const new_text = prompt("new text");
      if (new_text) {
        this.text = new_text;
        this.name = new_text;
        description.textContent = "\"" + this.name + "\"";
      }
    }).bind(this));
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
      let rect = this.ctx.measureText(this.text);
      this.width = rect.width;
      this.height = rect.height;
      let x = f[0] + this.canvas.width / 2;
      let y = f[1] + this.canvas.height / 2;
      this.ctx.shadowColor = "black";
      this.ctx.shadowBlur = 7;
      this.ctx.fillStyle = this.color;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillText(this.text, x, y);
      this.drawScaled(this.ctx, ctx_out);
    }
  }
}

class VideoLayer extends RenderedLayer {
  constructor(file) {
    super(file);

    // assume all videos fit in 1GB of ram
    this.max_size = 1000 * 1e6; // 1GB max
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
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
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
      this.ctx.putImageData(frame, 0, 0);
      this.drawScaled(this.ctx, this.thumb_ctx);
      this.title_div.textContent = (100 * i / (d * fps)).toFixed(2) + "%";
    }
    this.ready = true;
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
  }

  intersectsTime(time, query) {
    if (!query) {
      query = this.time;
    }
    return Math.abs(query - time) / this.total_time < 0.01;
  }

  scrubStart(ev) {
    this.scrubbing = true;
    let rect = this.time_holder.getBoundingClientRect();
    this.time = ev.offsetX / rect.width * this.total_time;

    window.addEventListener('mouseup', this.scrubEnd.bind(this), {
      once: true
    });

    let y_inc = this.time_canvas.height / (this.layers.length + 1);
    let y_coord = this.time_canvas.height;
    for (let layer of this.layers) {
      y_coord -= y_inc;
      if (layer.start_time > this.time) {
        continue;
      }
      if (layer.start_time + layer.total_time < this.time) {
        continue;
      }
      if (Math.abs(ev.offsetY - y_coord) < (0.05 * this.time_canvas.height)) {
        this.select(layer);
      }
    }

    // can't drag unselected
    if (!this.selected_layer) {
      return;
    }

    // edge case -- we have a selected layer, but not close enough
    if (Math.abs(ev.offsetY - y_coord) > (0.05 * this.time_canvas.height)) {
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

    let cursor_x = Math.max(ev.clientX - this.cursor_canvas.width / 2, 0);
    cursor_x = Math.min(cursor_x, rect.width - this.cursor_canvas.width );
    this.cursor_preview.style.display = "block";
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
        let scale = 1;
        scale -= e.deltaY * 0.01;
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
      dragging = true;
      e.preventDefault();
      let f = this.selected_layer.getFrame(this.time);
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

  loop(realtime) {
    // update canvas and time sizes
    {
      this.canvas.width = this.canvas.clientWidth;
      this.canvas.height = this.canvas.clientHeight;
    } {
      this.time_canvas.width = this.time_canvas.clientWidth;
      this.time_canvas.height = this.time_canvas.clientHeight;
    }

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
    this.time_ctx.clearRect(0, 0, this.time_canvas.width, this.time_canvas.height);
    let x = this.time_canvas.width * this.time / this.total_time;
    this.time_ctx.fillStyle = `rgb(210,210,210)`;
    this.time_ctx.fillRect(x, 0, 2, this.time_canvas.height);
    this.time_ctx.font = "10px courier";
    this.time_ctx.fillText(this.time.toFixed(2), 5, 10);
    this.time_ctx.fillText(this.total_time.toFixed(2), 5, 20);

    if (this.aux_time > 0) {
      let aux_x = this.time_canvas.width * this.aux_time / this.total_time;
      this.time_ctx.fillStyle = `rgb(110,110,110)`;
      this.time_ctx.fillRect(aux_x, 0, 1, this.time_canvas.height);
      this.render(this.cursor_ctx, this.aux_time, false);
    }

    let y_inc = this.time_canvas.height / (this.layers.length + 1);
    let y_coord = this.time_canvas.height - y_inc;
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
    player.add(new VideoLayer(file));
  } else if (file.type.indexOf('image') >= 0) {
    player.add(new ImageLayer(file));
  }
}

window.addEventListener('drop', function(ev) {
  ev.preventDefault();
  if (ev.dataTransfer.items) {
    for (var i = 0; i < ev.dataTransfer.items.length; i++) {
      if (ev.dataTransfer.items[i].kind === 'file') {
        const file = ev.dataTransfer.items[i].getAsFile();
        addFile(file);
      }
    }
  }
});

// TODO show something
window.addEventListener('dragover', function(e) {
  e.preventDefault();
});


window.addEventListener('keydown', function(ev) {
  if (ev.code == "Space") {
    player.playing = !player.playing;
  } else if (ev.code == "ArrowLeft") {
    player.prev();
  } else if (ev.code == "ArrowRight") {
    player.next();
  } else if (ev.code == "Backspace") {
    player.deleteAnchor();
  }
});

window.onbeforeunload = function() {
  return true;
};

function add_text() {
  let t = prompt("enter text");
  player.add(new TextLayer(t));
}

function exportVideo(blob) {
  const vid = document.createElement('video');
  vid.src = URL.createObjectURL(blob);
  vid.controls = true;
  backgroundElem(vid);
  let h = document.getElementById('header');
  let a = h.querySelector('a');
  if (!a) {
    a = document.createElement('a');
    a.download = 'exported.webm';
    a.textContent = 'download';
  }
  a.href = vid.src;
  document.getElementById('header').appendChild(a);
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

function download() {
  const e = document.getElementById('export');
  const e_text = e.textContent;
  e.textContent = "exporting...";
  const chunks = [];
  const stream = player.canvas.captureStream();
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = e => chunks.push(e.data);
  rec.onstop = e => exportVideo(new Blob(chunks, {
    type: 'video/webm'
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
