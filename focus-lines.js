(() => {
  const root = document.querySelector('#focusLineTool');
  if (!root) return;

  const fileInput = root.querySelector('.focus-file-input');
  const dropZone = root.querySelector('.focus-drop-zone');
  const stage = root.querySelector('.focus-stage');
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const hint = root.querySelector('.focus-canvas-hint');
  const selectionActions = root.querySelector('.focus-selection-actions');
  const controls = root.querySelector('.focus-controls');
  const downloadButton = root.querySelector('.focus-download-button');
  const toast = root.querySelector('.focus-toast');
  const sliders = Object.fromEntries(
    [...root.querySelectorAll('[data-slider]')].map(input => [input.dataset.slider, input])
  );

  let image = null;
  let selection = null;
  let dragStart = null;
  let selecting = false;
  let toastTimer = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function updateValues() {
    Object.entries(sliders).forEach(([name, input]) => {
      const output = root.querySelector(`[data-output="${name}"]`);
      output.value = name === 'length' ? `${input.value}%` : input.value;
    });
  }

  function currentColor() {
    return root.querySelector('input[name="focusLineColor"]:checked').value;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawBase() {
    if (!image) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  function drawSelectionBox(rect) {
    ctx.save();
    const scale = Math.max(1, canvas.width / 1200);
    ctx.setLineDash([8 * scale, 7 * scale]);
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = '#7faab6';
    ctx.fillStyle = 'rgba(155, 191, 201, .12)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  function drawLines() {
    drawBase();
    if (!selection || selecting) {
      if (selection) drawSelectionBox(selection);
      return;
    }

    const count = Number(sliders.density.value);
    const unit = Math.max(.7, Math.min(canvas.width, canvas.height) / 900);
    const reach = Number(sliders.length.value) / 100;
    const gap = Number(sliders.gap.value) * unit;
    const baseWeight = Number(sliders.weight.value) * unit;
    const centerX = selection.x + selection.width / 2;
    const centerY = selection.y + selection.height / 2;
    const innerRx = selection.width / 2 + gap;
    const innerRy = selection.height / 2 + gap;
    const rand = seededRandom(Math.round(centerX * 7 + centerY * 13 + count));

    ctx.save();
    ctx.fillStyle = currentColor();
    for (let i = 0; i < count; i += 1) {
      const baseAngle = Math.PI * 2 * i / count;
      const angle = baseAngle + (rand() - .5) * (Math.PI * 1.35 / count);
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const ellipseDistance = 1 / Math.sqrt((ux * ux) / (innerRx * innerRx) + (uy * uy) / (innerRy * innerRy));
      const desiredInnerDistance = ellipseDistance * (.9 + rand() * .16);
      const edgeX = Math.abs(ux) < .000001 ? Infinity : (ux > 0 ? (canvas.width - centerX) / ux : -centerX / ux);
      const edgeY = Math.abs(uy) < .000001 ? Infinity : (uy > 0 ? (canvas.height - centerY) / uy : -centerY / uy);
      const edgeDistance = Math.min(edgeX, edgeY);
      const innerDistance = Math.min(desiredInnerDistance, Math.max(0, edgeDistance - unit));
      const outerDistance = innerDistance + (edgeDistance - innerDistance) * reach;
      const innerX = centerX + ux * innerDistance;
      const innerY = centerY + uy * innerDistance;
      const outerX = centerX + ux * outerDistance;
      const outerY = centerY + uy * outerDistance;
      const px = -uy;
      const py = ux;
      const outerHalf = baseWeight * (.34 + rand() * .78) / 2;
      const innerHalf = Math.max(.22 * unit, outerHalf * (.025 + rand() * .065));

      ctx.globalAlpha = .86 + rand() * .14;
      ctx.beginPath();
      ctx.moveTo(outerX + px * outerHalf, outerY + py * outerHalf);
      ctx.lineTo(outerX - px * outerHalf, outerY - py * outerHalf);
      ctx.lineTo(innerX - px * innerHalf, innerY - py * innerHalf);
      ctx.lineTo(innerX + px * innerHalf, innerY + py * innerHalf);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function pointFromEvent(event) {
    const box = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - box.left) * canvas.width / box.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - box.top) * canvas.height / box.height))
    };
  }

  function beginSelection(event) {
    if (!image) return;
    selecting = true;
    canvas.setPointerCapture(event.pointerId);
    dragStart = pointFromEvent(event);
    selection = { x: dragStart.x, y: dragStart.y, width: 0, height: 0 };
    drawLines();
  }

  function moveSelection(event) {
    if (!selecting || !dragStart) return;
    const point = pointFromEvent(event);
    selection = {
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(dragStart.x - point.x),
      height: Math.abs(dragStart.y - point.y)
    };
    drawLines();
  }

  function endSelection(event) {
    if (!selecting) return;
    selecting = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!selection || selection.width < 8 || selection.height < 8) {
      selection = null;
      hint.classList.remove('done');
      downloadButton.disabled = true;
      controls.setAttribute('aria-disabled', 'true');
      drawBase();
      return;
    }
    hint.classList.add('done');
    downloadButton.disabled = false;
    controls.setAttribute('aria-disabled', 'false');
    drawLines();
  }

  function fittedSize(width, height) {
    const scale = Math.min(1, 2400 / Math.max(width, height), Math.sqrt(4000000 / (width * height)));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  function makeSourceCanvas(source, width, height) {
    const size = fittedSize(width, height);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = size.width;
    sourceCanvas.height = size.height;
    const sourceContext = sourceCanvas.getContext('2d', { alpha: false });
    sourceContext.imageSmoothingEnabled = true;
    sourceContext.imageSmoothingQuality = 'high';
    sourceContext.drawImage(source, 0, 0, size.width, size.height);
    return sourceCanvas;
  }

  function loadWithImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const nextImage = new Image();
      nextImage.onload = () => {
        try { resolve(makeSourceCanvas(nextImage, nextImage.naturalWidth, nextImage.naturalHeight)); }
        catch (error) { reject(error); }
        finally { URL.revokeObjectURL(url); nextImage.src = ''; }
      };
      nextImage.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_decode_failed')); };
      nextImage.src = url;
    });
  }

  async function decodeFile(file) {
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const sourceCanvas = makeSourceCanvas(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
        return sourceCanvas;
      } catch (error) { /* Image element fallback for mobile formats. */ }
    }
    return loadWithImageElement(file);
  }

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      if (file) showToast('画像ファイルを選んでください');
      return;
    }
    dropZone.classList.add('loading');
    dropZone.disabled = true;
    try {
      image = await decodeFile(file);
      canvas.width = image.width;
      canvas.height = image.height;
      selection = null;
      dropZone.hidden = true;
      stage.hidden = false;
      selectionActions.hidden = false;
      selectionActions.style.display = 'flex';
      controls.setAttribute('aria-disabled', 'true');
      downloadButton.disabled = true;
      hint.classList.remove('done');
      drawBase();
    } catch (error) {
      showToast('画像を読み込めませんでした');
    } finally {
      dropZone.classList.remove('loading');
      dropZone.disabled = false;
    }
  }

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    loadFile(file);
  });
  root.querySelector('.focus-change-image-button').addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
  }));
  dropZone.addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));

  canvas.addEventListener('pointerdown', beginSelection);
  canvas.addEventListener('pointermove', moveSelection);
  canvas.addEventListener('pointerup', endSelection);
  canvas.addEventListener('pointercancel', endSelection);

  root.querySelector('.focus-reselect-button').addEventListener('click', () => {
    selection = null;
    downloadButton.disabled = true;
    controls.setAttribute('aria-disabled', 'true');
    hint.classList.remove('done');
    drawBase();
    showToast('目立たせたい部分をもう一度囲んでください');
  });

  Object.values(sliders).forEach(slider => slider.addEventListener('input', () => {
    updateValues();
    drawLines();
  }));
  root.querySelectorAll('input[name="focusLineColor"]').forEach(input => input.addEventListener('change', drawLines));

  downloadButton.addEventListener('click', () => {
    if (!selection) return;
    drawLines();
    canvas.toBlob(blob => {
      if (!blob) { showToast('保存用の画像を作れませんでした'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'shuchusen.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('画像を保存しました');
    }, 'image/png');
  });

  updateValues();
})();
