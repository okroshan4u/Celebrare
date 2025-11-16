let swiper = null;
let selectedTextElement = null;
let textIdCounter = 3;

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

let isResizingNow = false;
let resizeStartWidth = 0;
let resizeStartHeight = 0;
let resizeStartFontSize = 0;

const SNAP_THRESHOLD = 6;

let history = [];
let historyStep = -1;
const MAX_HISTORY = 50;

function isResizing(el, e) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const edgeX = rect.right - e.clientX;
  const edgeY = rect.bottom - e.clientY;
  return edgeX < 14 && edgeY < 14;
}

function autoExpand(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function rgbToHex(rgb) {
  if (!rgb) return "#000000";
  if (rgb.startsWith("#")) return rgb;
  const m = rgb.match(/\d+/g);
  if (!m) return "#000000";
  const r = parseInt(m[0]).toString(16).padStart(2, "0");
  const g = parseInt(m[1]).toString(16).padStart(2, "0");
  const b = parseInt(m[2]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function ensureGuides(container) {
  if (!container) return;
  if (container._hasGuides) return;
  container._hasGuides = true;

  const vert = document.createElement("div");
  vert.className = "guide-line guide-vert";
  Object.assign(vert.style, {
    position: "absolute",
    top: "0",
    height: "100%",
    width: "1px",
    background: "rgba(255,0,128,0.9)",
    display: "none",
    zIndex: 9999,
    pointerEvents: "none",
    transform: "translateX(-0.5px)"
  });

  const hor = document.createElement("div");
  hor.className = "guide-line guide-horz";
  Object.assign(hor.style, {
    left: "0",
    width: "100%",
    height: "1px",
    background: "rgba(255,0,128,0.9)",
    display: "none",
    zIndex: 9999,
    pointerEvents: "none",
    transform: "translateY(-0.5px)",
    position: "absolute"
  });

  container.appendChild(vert);
  container.appendChild(hor);
  container._guideVert = vert;
  container._guideHorz = hor;
}

function showVerticalGuide(container, xPx) {
  if (!container || !container._guideVert) return;
  container._guideVert.style.left = xPx + "px";
  container._guideVert.style.display = "block";
}

function showHorizontalGuide(container, yPx) {
  if (!container || !container._guideHorz) return;
  container._guideHorz.style.top = yPx + "px";
  container._guideHorz.style.display = "block";
}

function hideGuides(container) {
  if (!container) return;
  if (container._guideVert) container._guideVert.style.display = "none";
  if (container._guideHorz) container._guideHorz.style.display = "none";
}

function captureState() {
  const slides = document.querySelectorAll(".image-container");
  const labels = document.querySelectorAll(".slide-label");
  const state = {
    projectTitle: document.getElementById("projectTitle") ? document.getElementById("projectTitle").textContent : "",
    slideTitles: [],
    sidebarLabels: [],
    slides: []
  };

  slides.forEach((slide, index) => {
    state.slideTitles[index] = document.getElementById("slideTitle") ? document.getElementById("slideTitle").textContent : "";
    state.sidebarLabels[index] = labels[index] ? labels[index].textContent : (`Page ${index + 1}`);
    const slideData = { index, texts: [] };
    slide.querySelectorAll(".text-element").forEach(el => {
      slideData.texts.push({
        id: el.getAttribute("data-text-id"),
        content: el.textContent,
        top: el.style.top,
        left: el.style.left,
        width: el.style.width || "",
        height: el.style.height || "",
        fontSize: el.style.fontSize || "",
        color: el.style.color || "",
        fontFamily: el.style.fontFamily || "",
        fontWeight: el.style.fontWeight || "",
        fontStyle: el.style.fontStyle || "",
        textAlign: el.style.textAlign || ""
      });
    });
    state.slides.push(slideData);
  });

  return state;
}

function saveState() {
  const currentState = captureState();
  history = history.slice(0, historyStep + 1);
  history.push(currentState);

  if (history.length > MAX_HISTORY) history.shift();
  else historyStep++;

  updateUndoRedoButtons();

  localStorage.setItem("celebrare_project_state", JSON.stringify(currentState));
}

function restoreState(state) {
  if (!state) return;
  const projectTitleEl = document.getElementById("projectTitle");
  if (projectTitleEl && state.projectTitle !== undefined) projectTitleEl.textContent = state.projectTitle;

  const labels = document.querySelectorAll(".slide-label");
  if (state.sidebarLabels && labels.length) {
    state.sidebarLabels.forEach((txt, i) => {
      if (labels[i]) labels[i].textContent = txt;
    });
  }

  if (document.getElementById("slideTitle") && state.slideTitles) {
    document.getElementById("slideTitle").textContent = state.slideTitles[swiper ? swiper.activeIndex : 0] || "Blessing";
  }

  const containers = document.querySelectorAll(".image-container");
  containers.forEach((slide, index) => {
    slide.querySelectorAll(".text-element").forEach(el => el.remove());
    const slideData = state.slides[index];
    if (!slideData) return;
    slideData.texts.forEach(t => {
      const el = document.createElement("div");
      el.className = "text-element";
      el.setAttribute("data-text-id", t.id || (textIdCounter++));
      el.textContent = t.content || "";
      Object.assign(el.style, {
        position: "absolute",
        top: t.top || "10%",
        left: t.left || "10%",
        width: t.width || "",
        height: t.height || "auto",
        fontSize: t.fontSize || "",
        color: t.color || "",
        fontFamily: t.fontFamily || "",
        fontWeight: t.fontWeight || "",
        fontStyle: t.fontStyle || "",
        textAlign: t.textAlign || ""
      });
      slide.appendChild(el);
      attachTextListeners(el);
      autoExpand(el);
    });
    ensureGuides(slide);
    hideGuides(slide);
  });

  selectedTextElement = null;
  updateEditor();
  updateThumbnailsPreview();
}

function undo() {
  if (historyStep > 0) {
    historyStep--;
    restoreState(history[historyStep]);
    updateUndoRedoButtons();
  }
}

function redo() {
  if (historyStep < history.length - 1) {
    historyStep++;
    restoreState(history[historyStep]);
    updateUndoRedoButtons();
  }
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = historyStep <= 0;
  if (redoBtn) redoBtn.disabled = historyStep >= history.length - 1;
}

function startPointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const el = e.currentTarget || this;
  if (!el) return;

  if (!el.classList.contains("selected")) {
    document.querySelectorAll(".text-element").forEach(x => x.classList.remove("selected"));
    el.classList.add("selected");
    selectedTextElement = el;
    updateEditor();
  }

  const container = el.parentElement;
  ensureGuides(container);
  hideGuides(container);

  if (isResizing(el, e)) {
    isResizingNow = true;
    selectedTextElement = el;
    const styles = window.getComputedStyle(el);
    resizeStartWidth = parseFloat(styles.width) || el.offsetWidth;
    resizeStartHeight = parseFloat(styles.height) || el.offsetHeight;
    resizeStartFontSize = parseFloat(styles.fontSize) || 16;
    el.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", handleResizeEnd);
    window.addEventListener("pointercancel", handleResizeEnd);
    if (swiper) swiper.allowTouchMove = false;
    return;
  }

  isDragging = true;
  const rect = el.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;

  selectedTextElement = el;
  el.setPointerCapture(e.pointerId);
  window.addEventListener("pointermove", handleDragMove);
  window.addEventListener("pointerup", handleDragEnd);
  window.addEventListener("pointercancel", handleDragEnd);
  if (swiper) swiper.allowTouchMove = false;
}

function handleDragMove(e) {
  if (!isDragging || !selectedTextElement) return;
  const container = selectedTextElement.parentElement;
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const elRect = selectedTextElement.getBoundingClientRect();

  let newLeft = e.clientX - containerRect.left - dragOffsetX;
  let newTop = e.clientY - containerRect.top - dragOffsetY;

  newLeft = Math.max(0, Math.min(newLeft, containerRect.width - elRect.width));
  newTop = Math.max(0, Math.min(newTop, containerRect.height - elRect.height));

  const candidatesX = [];
  const candidatesY = [];

  candidatesX.push(0);
  candidatesX.push(containerRect.width - elRect.width);
  candidatesX.push((containerRect.width - elRect.width) / 2);

  candidatesY.push(0);
  candidatesY.push(containerRect.height - elRect.height);
  candidatesY.push((containerRect.height - elRect.height) / 2);

  container.querySelectorAll(".text-element").forEach(other => {
    if (other === selectedTextElement) return;
    const r = other.getBoundingClientRect();
    const otherLeft = r.left - containerRect.left;
    const otherTop = r.top - containerRect.top;

    candidatesX.push(otherLeft);
    candidatesX.push(otherLeft + r.width - elRect.width);
    candidatesX.push(otherLeft + r.width / 2 - elRect.width / 2);

    candidatesY.push(otherTop);
    candidatesY.push(otherTop + r.height - elRect.height);
    candidatesY.push(otherTop + r.height / 2 - elRect.height / 2);
  });

  let snappedX = null;
  let snappedY = null;
  let snapGuideX = null;
  let snapGuideY = null;

  let minDistX = SNAP_THRESHOLD + 1;
  candidatesX.forEach(candidate => {
    const d = Math.abs(candidate - newLeft);
    if (d < minDistX) {
      minDistX = d;
      snappedX = candidate;
    }
  });
  if (minDistX <= SNAP_THRESHOLD) {
    newLeft = snappedX;
    snapGuideX = snappedX + (elRect.width / 2);
  }

  let minDistY = SNAP_THRESHOLD + 1;
  candidatesY.forEach(candidate => {
    const d = Math.abs(candidate - newTop);
    if (d < minDistY) {
      minDistY = d;
      snappedY = candidate;
    }
  });
  if (minDistY <= SNAP_THRESHOLD) {
    newTop = snappedY;
    snapGuideY = snappedY + (elRect.height / 2);
  }

  selectedTextElement.style.left = (newLeft / containerRect.width) * 100 + "%";
  selectedTextElement.style.top = (newTop / containerRect.height) * 100 + "%";
  selectedTextElement.style.transform = "none";

  if (snapGuideX !== null) {
    showVerticalGuide(container, snapGuideX);
  } else {
    if (container._guideVert) container._guideVert.style.display = "none";
  }

  if (snapGuideY !== null) {
    showHorizontalGuide(container, snapGuideY);
  } else {
    if (container._guideHorz) container._guideHorz.style.display = "none";
  }
}

function handleDragEnd(e) {
  if (!isDragging) return;
  isDragging = false;
  try { selectedTextElement.releasePointerCapture(e.pointerId); } catch { }
  window.removeEventListener("pointermove", handleDragMove);
  window.removeEventListener("pointerup", handleDragEnd);
  window.removeEventListener("pointercancel", handleDragEnd);

  if (selectedTextElement && selectedTextElement.parentElement) {
    hideGuides(selectedTextElement.parentElement);
  }

  if (swiper) swiper.allowTouchMove = true;
  saveState();
}

function handleResizeMove(e) {
  if (!isResizingNow || !selectedTextElement) return;
  const rect = selectedTextElement.getBoundingClientRect();
  const newWidth = e.clientX - rect.left;
  const newHeight = e.clientY - rect.top;
  if (newWidth < 40 || newHeight < 20) return;
  const widthScale = newWidth / resizeStartWidth;
  const heightScale = newHeight / resizeStartHeight;
  const scaleFactor = Math.min(widthScale, heightScale);
  selectedTextElement.style.width = newWidth + "px";
  const newFontSize = resizeStartFontSize * scaleFactor;
  selectedTextElement.style.fontSize = newFontSize + "px";
  selectedTextElement.style.height = "auto";
  selectedTextElement.style.height = selectedTextElement.scrollHeight + "px";
}

function handleResizeEnd(e) {
  if (!isResizingNow) return;
  isResizingNow = false;
  try { selectedTextElement.releasePointerCapture(e.pointerId); } catch { }
  window.removeEventListener("pointermove", handleResizeMove);
  window.removeEventListener("pointerup", handleResizeEnd);
  window.removeEventListener("pointercancel", handleResizeEnd);
  if (swiper) swiper.allowTouchMove = true;
  saveState();
}

function selectText(e) {
  e.stopPropagation();
  const el = e.currentTarget || this;
  document.querySelectorAll(".text-element").forEach(x => x.classList.remove("selected"));
  el.classList.add("selected");
  selectedTextElement = el;
  updateEditor();
}

function enableInlineEdit(el) {
  if (!el) return;
  el.setAttribute("contenteditable", "true");
  el.focus();
  autoExpand(el);

  const onInput = () => {
    autoExpand(el);
    const t = document.getElementById("textContent");
    if (t) t.value = el.textContent;
  };
  const onBlur = () => {
    el.removeAttribute("contenteditable");
    el.removeEventListener("input", onInput);
    el.removeEventListener("blur", onBlur);
    autoExpand(el);
    saveState();
  };

  el.addEventListener("input", onInput);
  el.addEventListener("blur", onBlur);
}

function attachTextListeners(el) {
  if (!el) return;
  el.style.touchAction = "none";
  el.style.boxSizing = "border-box";
  if (!el.style.left) el.style.left = "10%";
  if (!el.style.top) el.style.top = "10%";
  el.addEventListener("pointerdown", startPointerDown);
  el.addEventListener("click", selectText);
  el.addEventListener("dblclick", (ev) => { ev.stopPropagation(); enableInlineEdit(el); });
  autoExpand(el);
  ensureGuides(el.parentElement);
}

function updateEditor() {
  const textInput = document.getElementById("textContent");
  const fontFamily = document.getElementById("fontFamily");
  const fontSize = document.getElementById("fontSize");
  const fontColor = document.getElementById("fontColor");
  const colorPreview = document.getElementById("colorPreview");

  if (!selectedTextElement) {
    if (textInput) textInput.value = "";
    if (fontFamily) fontFamily.value = "'Georgia', serif";
    if (fontSize) fontSize.value = 22;
    if (fontColor) fontColor.value = "#000000";
    if (colorPreview) colorPreview.style.background = "#000000";
    return;
  }

  if (textInput) textInput.value = selectedTextElement.textContent;
  if (fontFamily) fontFamily.value = selectedTextElement.style.fontFamily || "'Georgia', serif";
  if (fontSize) fontSize.value = parseInt(selectedTextElement.style.fontSize) || 22;
  if (fontColor) {
    const hex = rgbToHex(selectedTextElement.style.color || "#000000");
    fontColor.value = hex;
    if (colorPreview) colorPreview.style.background = hex;
  }

  if (fontStyle) {
    if (selectedTextElement.style.fontWeight === "bold") {
      fontStyle.value = "bold";
    } else if (selectedTextElement.style.fontStyle === "italic") {
      fontStyle.value = "italic";
    } else {
      fontStyle.value = "normal";
    }
  }
}

const alignmentBtn = document.getElementById("alignmentBtn");

if (alignmentBtn) {
  alignmentBtn.addEventListener("click", function () {
    if (!selectedTextElement) return;

    let current = selectedTextElement.style.textAlign || "left";

    let next =
      current === "left" ? "center" :
        current === "center" ? "right" :
          "left";

    selectedTextElement.style.textAlign = next;

    document.getElementById("textContent").style.textAlign = next;

    saveState();
  });
}

const lineHeightBtn = document.getElementById("lineHeightBtn");

if (lineHeightBtn) {
  lineHeightBtn.addEventListener("click", function () {
    if (!selectedTextElement) return;

    let current = parseFloat(selectedTextElement.style.lineHeight) || 1.2;

    const sequence = [1.0, 1.2, 1.4, 1.6];
    let nextIndex = (sequence.indexOf(current) + 1) % sequence.length;
    let next = sequence[nextIndex];

    selectedTextElement.style.lineHeight = next;

    document.getElementById("textContent").style.lineHeight = next;

    autoExpand(selectedTextElement);
    saveState();
  });
}

const fontStyleEl = document.getElementById("fontStyle");

if (fontStyleEl) {
  fontStyleEl.addEventListener("change", function () {
    if (!selectedTextElement) return;

    const style = this.value;

    selectedTextElement.style.fontWeight = "normal";
    selectedTextElement.style.fontStyle = "normal";

    if (style === "bold") {
      selectedTextElement.style.fontWeight = "bold";
    } else if (style === "italic") {
      selectedTextElement.style.fontStyle = "italic";
    }

    autoExpand(selectedTextElement);
    saveState();
  });
}

(function wireEditor() {
  const textContentEl = document.getElementById("textContent");
  if (textContentEl) {
    textContentEl.addEventListener("input", function () {
      if (selectedTextElement) selectedTextElement.textContent = this.value;
      autoExpand(selectedTextElement);
    });
    textContentEl.addEventListener("change", saveState);
  }

  const fontFamilyEl = document.getElementById("fontFamily");
  if (fontFamilyEl) fontFamilyEl.addEventListener("change", function () {
    if (selectedTextElement) { selectedTextElement.style.fontFamily = this.value; saveState(); }
  });

  const fontSizeEl = document.getElementById("fontSize");
  if (fontSizeEl) fontSizeEl.addEventListener("change", function () {
    if (selectedTextElement) { selectedTextElement.style.fontSize = this.value + "px"; autoExpand(selectedTextElement); saveState(); }
  });

  const fontColorEl = document.getElementById("fontColor");
  if (fontColorEl) fontColorEl.addEventListener("input", function () {
    if (selectedTextElement) {
      selectedTextElement.style.color = this.value;
      const preview = document.getElementById("colorPreview");
      if (preview) preview.style.background = this.value;
    }
  });
  if (fontColorEl) fontColorEl.addEventListener("change", saveState);
})();

function addText() {
  if (!swiper) return;
  const slide = document.querySelector(`.swiper-slide:nth-child(${swiper.activeIndex + 1}) .image-container`);
  if (!slide) return;

  const el = document.createElement("div");
  el.className = "text-element";
  el.setAttribute("data-text-id", textIdCounter++);
  el.textContent = "New Text";

  Object.assign(el.style, {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "24px",
    fontFamily: "Arial, sans-serif",
    color: "#000",
    width: "160px",
    minWidth: "60px",
    minHeight: "30px",
    whiteSpace: "pre-wrap",
    overflow: "hidden",
    resize: "none",
    boxSizing: "border-box"
  });

  slide.appendChild(el);
  attachTextListeners(el);
  selectedTextElement = el;
  autoExpand(el);
  saveState();
}

function deleteText() {
  if (!selectedTextElement) return;
  selectedTextElement.remove();
  selectedTextElement = null;
  saveState();
}

function updateThumbnails() {
  const thumbs = document.querySelectorAll(".page-thumbnail");
  thumbs.forEach((t, i) => t.classList.toggle("active", i === (swiper ? swiper.activeIndex : 0)));
}

function goToSlide(i) {
  if (!swiper) return;
  swiper.slideTo(i);
}

function updateThumbnailsPreview() {
  const slides = document.querySelectorAll(".swiper-slide .image-container");
  document.querySelectorAll(".page-thumbnail").forEach(p => {
    if (!p.querySelector(".thumbnail-container")) {
      const div = document.createElement("div");
      div.className = "thumbnail-container";
      p.appendChild(div);
    }
  });
  const thumbs = document.querySelectorAll(".thumbnail-container");
  slides.forEach((slide, i) => {
    const thumb = thumbs[i];
    if (!thumb) return;
    thumb.innerHTML = "";
    const clone = slide.cloneNode(true);
    clone.classList.add("thumbnail-content");
    clone.querySelectorAll(".text-element").forEach(t => {
      t.classList.remove("selected");
      t.removeAttribute("contenteditable");
      t.style.pointerEvents = "none";
    });
    thumb.appendChild(clone);
  });

  document.querySelectorAll(".page-thumbnail").forEach((p, idx) => {
    p.style.cursor = "pointer";
    p.onclick = () => goToSlide(idx);
  });
}

const savedData = localStorage.getItem("celebrare_project_state");

if (savedData) {
  const parsed = JSON.parse(savedData);
  setTimeout(() => {
    restoreState(parsed);
    updateThumbnailsPreview();
  }, 100);
}

function initSwiper() {
  swiper = new Swiper(".swiper", {
    direction: "horizontal",
    navigation: { nextEl: ".swiper-button-next", prevEl: ".swiper-button-prev" },
    pagination: { el: ".swiper-pagination", clickable: true },
    on: {
      slideChange: function () {
        updateThumbnails();
        selectedTextElement = null;
        updateEditor();
        updateThumbnailsPreview();
      }
    }
  });
}

function initTextElements() {
  document.querySelectorAll(".text-element").forEach(attachTextListeners);
  document.querySelectorAll(".image-container").forEach(c => ensureGuides(c));
  saveState();
  updateThumbnailsPreview();
}

document.addEventListener("click", function (e) {
  if (isDragging || isResizingNow) return;
  const isTextEl = e.target.closest(".text-element");
  const isEditor = e.target.closest(".editor-panel");
  if (!isTextEl && !isEditor) {
    document.querySelectorAll(".text-element").forEach(x => x.classList.remove("selected"));
    selectedTextElement = null;
    updateEditor();
  }
});

document.addEventListener("keydown", function (e) {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); }
  else if (e.key === "Delete" && selectedTextElement) { e.preventDefault(); deleteText(); }
});

const projectTitleEl = document.getElementById("projectTitle");
if (projectTitleEl) projectTitleEl.addEventListener("input", saveState);

const slideTitleEl = document.getElementById("slideTitle");
if (slideTitleEl) slideTitleEl.addEventListener("input", saveState);

document.querySelectorAll(".slide-label").forEach(lbl => lbl.addEventListener("input", saveState));

const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
if (undoBtn) undoBtn.addEventListener("click", undo);
if (redoBtn) redoBtn.addEventListener("click", redo);

const saveBtn = document.getElementById("saveBtn");
if (saveBtn) saveBtn.addEventListener("click", () => {
  const data = captureState();
  const jsonData = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const projectName = document.getElementById("projectTitle").textContent.trim() || "celebrare-project";
  a.download = projectName.replace(/\s+/g, "_") + ".json";

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert("Project saved successfully!");
});

const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", async function () {
    this.disabled = true;
    this.textContent = "Generating...";
    try {
      const slides = document.querySelectorAll(".swiper-slide");
      const images = [];
      const prev = document.querySelector(".swiper-button-prev");
      const next = document.querySelector(".swiper-button-next");
      const pag = document.querySelector(".swiper-pagination");
      if (prev) prev.style.display = "none";
      if (next) next.style.display = "none";
      if (pag) pag.style.display = "none";
      document.querySelectorAll(".text-element").forEach(el => el.classList.remove("selected"));
      for (let i = 0; i < slides.length; i++) {
        swiper.slideTo(i, 0);
        await new Promise(r => setTimeout(r, 120));
        const container = slides[i].querySelector(".image-container");
        if (!container) continue;
        const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: null });
        images.push(canvas.toDataURL("image/png"));
      }
      if (prev) prev.style.display = "";
      if (next) next.style.display = "";
      if (pag) pag.style.display = "";
      images.forEach((img, idx) => {
        const a = document.createElement("a");
        a.href = img;
        const projectName = document.getElementById("projectTitle").textContent.trim() || "celebrare";
        a.download = `${projectName.replace(/\s+/g, "_")}-slide-${idx + 1}.png`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
      alert(`Downloaded ${images.length} slides successfully!`);
    } catch (err) {
      console.error(err);
      alert("Error generating images. Ensure html2canvas is loaded and images are CORS-friendly.");
    } finally {
      this.disabled = false;
      this.textContent = "Download ⬇";
    }
  });
}

initSwiper();
initTextElements();

(function injectGuideStyles() {
  const css = `
    .guide-line { pointer-events: none; position: absolute; z-index: 9999; }
    .guide-vert { width: 1px; background: rgba(255,0,128,0.9); top:0; bottom:0; transform: translateX(-0.5px); }
    .guide-horz { height: 1px; background: rgba(255,0,128,0.9); left:0; right:0; transform: translateY(-0.5px); }
  `;
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
})();
