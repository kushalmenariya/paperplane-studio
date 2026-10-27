(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const toast = $("#toast");
  let toastTimer;
  const imageFiles = [];
  let resizeImage = null;
  let originalDimensions = null;
  let keepAspectRatio = true;
  let pdfDocumentBytes = null;
  let pdfPages = [];
  let currentPdfName = "edited-document.pdf";
  let installPrompt = null;

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    $("#install-app").classList.remove("hidden");
  });

  $("#install-app").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $("#install-app").classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    $("#install-app").classList.add("hidden");
    showToast("Paperplane Studio was installed.");
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeBaseName(filename) {
    return filename.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-") || "image";
  }

  function setActiveTool(tool) {
    $$(".tool-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${tool}`));
    $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.tool === tool));
    $("#breadcrumb-current").textContent = {
      convert: "Image to PDF",
      resize: "Resize images",
      scan: "Text scanner",
      editor: "PDF editor"
    }[tool];
  }

  $$(".nav-item").forEach((item) => item.addEventListener("click", () => setActiveTool(item.dataset.tool)));
  $$(".segment").forEach((item) => item.addEventListener("click", () => {
    $$(".segment").forEach((segment) => segment.classList.remove("active"));
    item.classList.add("active");
  }));

  function bindDropzone(dropzone, input, handler) {
    const zone = $(dropzone);
    const fileInput = $(input);
    ["dragenter", "dragover"].forEach((eventName) => zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    }));
    ["dragleave", "drop"].forEach((eventName) => zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
    }));
    zone.addEventListener("drop", (event) => handler(event.dataTransfer.files));
    fileInput.addEventListener("change", () => {
      handler(fileInput.files);
      fileInput.value = "";
    });
  }

  function addImageFiles(files) {
    const accepted = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (accepted.length !== files.length) showToast("Please choose image files only.");
    accepted.forEach((file) => imageFiles.push({ file, id: crypto.randomUUID(), url: URL.createObjectURL(file) }));
    renderImageFiles();
  }

  function renderImageFiles() {
    const list = $("#convert-files");
    $("#convert-count").textContent = `${imageFiles.length} ${imageFiles.length === 1 ? "file" : "files"}`;
    $("#convert-button").disabled = imageFiles.length === 0;
    if (!imageFiles.length) {
      list.className = "file-list empty-list";
      list.innerHTML = '<div class="empty-state">Your images will appear here</div>';
      return;
    }
    list.className = "file-list";
    list.replaceChildren();
    imageFiles.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "file-row";
      const thumbnail = document.createElement("img");
      thumbnail.className = "file-thumb";
      thumbnail.src = entry.url;
      thumbnail.alt = "";
      const meta = document.createElement("div");
      meta.className = "file-meta";
      const name = document.createElement("strong");
      name.textContent = `${index + 1}. ${entry.file.name}`;
      const size = document.createElement("small");
      size.textContent = formatBytes(entry.file.size);
      meta.append(name, size);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "file-action";
      remove.setAttribute("aria-label", `Remove ${entry.file.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        URL.revokeObjectURL(entry.url);
        imageFiles.splice(index, 1);
        renderImageFiles();
      });
      row.append(thumbnail, meta, remove);
      list.append(row);
    });
  }

  bindDropzone("#convert-dropzone", "#convert-input", addImageFiles);

  $("#pdf-margin").addEventListener("input", (event) => {
    $("#margin-value").value = `${event.target.value} mm`;
  });

  $("#convert-button").addEventListener("click", async () => {
    if (!imageFiles.length) return;
    if (!window.jspdf?.jsPDF) {
      showToast("PDF tools did not load. Check your internet connection and reload.");
      return;
    }
    const button = $("#convert-button");
    button.disabled = true;
    button.firstChild.textContent = "Creating PDF… ";
    try {
      const paper = $("#pdf-paper").value;
      const orientation = $(".segment.active").dataset.orientation;
      const margin = Number($("#pdf-margin").value);
      const { jsPDF } = window.jspdf;
      const preparedImages = await Promise.all(imageFiles.map(async ({ file }) => {
        const source = await readAsDataUrl(file);
        const image = await loadImage(source);
        const dataUrl = source.startsWith("data:image/png")
          ? source
          : rasterizeImage(image, "image/jpeg");
        return { file, dataUrl, image };
      }));
      const firstImage = preparedImages[0].image;
      const firstPageFormat = paper === "fit"
        ? [firstImage.naturalWidth * 0.264583 + margin * 2, firstImage.naturalHeight * 0.264583 + margin * 2]
        : paper;
      const doc = new jsPDF({
        orientation: paper === "fit"
          ? (firstPageFormat[0] > firstPageFormat[1] ? "landscape" : "portrait")
          : orientation,
        unit: "mm",
        format: firstPageFormat
      });
      for (let index = 0; index < preparedImages.length; index += 1) {
        const { dataUrl, image } = preparedImages[index];
        const imageType = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
        const imageWidth = image.naturalWidth;
        const imageHeight = image.naturalHeight;
        let pageWidth;
        let pageHeight;
        if (paper === "fit") {
          pageWidth = imageWidth * 0.264583 + margin * 2;
          pageHeight = imageHeight * 0.264583 + margin * 2;
          if (index > 0) doc.addPage([pageWidth, pageHeight], pageWidth > pageHeight ? "landscape" : "portrait");
        } else {
          pageWidth = doc.internal.pageSize.getWidth();
          pageHeight = doc.internal.pageSize.getHeight();
          if (index > 0) doc.addPage(paper, orientation);
        }
        const availableWidth = Math.max(1, pageWidth - margin * 2);
        const availableHeight = Math.max(1, pageHeight - margin * 2);
        const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
        const drawWidth = imageWidth * scale;
        const drawHeight = imageHeight * scale;
        doc.addImage(dataUrl, imageType, (pageWidth - drawWidth) / 2, (pageHeight - drawHeight) / 2, drawWidth, drawHeight);
      }
      doc.save("paperplane-images.pdf");
      showToast(`Created a PDF with ${imageFiles.length} ${imageFiles.length === 1 ? "image" : "images"}.`);
    } catch (error) {
      console.error("Could not create PDF", error);
      showToast("Could not create the PDF. Try another image format.");
    } finally {
      button.disabled = imageFiles.length === 0;
      button.firstChild.textContent = "Create PDF ";
    }
  });

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read the selected image."));
      image.src = source;
    });
  }

  function rasterizeImage(image, type) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare image for PDF conversion.");
    context.drawImage(image, 0, 0);
    return canvas.toDataURL(type, 0.95);
  }

  function handleResizeFile(files) {
    const file = Array.from(files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) {
      showToast("Choose a valid image file.");
      return;
    }
    if (resizeImage) URL.revokeObjectURL(resizeImage.url);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resizeImage = { file, url, image };
      originalDimensions = { width: image.naturalWidth, height: image.naturalHeight };
      $("#resize-width").value = image.naturalWidth;
      $("#resize-height").value = image.naturalHeight;
      $("#resize-preview").innerHTML = "";
      const preview = document.createElement("img");
      preview.src = url;
      preview.alt = `Preview of ${file.name}`;
      const caption = document.createElement("div");
      caption.className = "preview-caption";
      caption.textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight} px · ${formatBytes(file.size)}`;
      $("#resize-preview").append(preview, caption);
      $("#resize-preview").classList.remove("hidden");
      $("#resize-button").disabled = false;
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showToast("Could not read that image.");
    };
    image.src = url;
  }

  bindDropzone(".resize-main .compact-dropzone", "#resize-input", handleResizeFile);

  $("#aspect-lock").addEventListener("click", (event) => {
    keepAspectRatio = !keepAspectRatio;
    const button = event.currentTarget;
    button.classList.toggle("locked", keepAspectRatio);
    button.setAttribute("aria-label", keepAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio");
    button.title = keepAspectRatio ? "Keep aspect ratio" : "Aspect ratio unlocked";
  });
  $("#resize-width").addEventListener("input", (event) => {
    if (keepAspectRatio && originalDimensions && Number(event.target.value) > 0) {
      $("#resize-height").value = Math.max(1, Math.round(Number(event.target.value) * originalDimensions.height / originalDimensions.width));
    }
  });
  $("#resize-height").addEventListener("input", (event) => {
    if (keepAspectRatio && originalDimensions && Number(event.target.value) > 0) {
      $("#resize-width").value = Math.max(1, Math.round(Number(event.target.value) * originalDimensions.width / originalDimensions.height));
    }
  });
  $("#resize-quality").addEventListener("input", (event) => {
    $("#quality-value").value = `${event.target.value}%`;
  });
  $("#resize-button").addEventListener("click", () => {
    if (!resizeImage) return;
    const width = Number($("#resize-width").value);
    const height = Number($("#resize-height").value);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 12000 || height > 12000) {
      showToast("Enter a width and height between 1 and 12,000 pixels.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      showToast("Your browser could not prepare the resized image.");
      return;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(resizeImage.image, 0, 0, width, height);
    const type = $("#resize-format").value;
    const quality = Number($("#resize-quality").value) / 100;
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast("Could not export this image in that format.");
        return;
      }
      const extension = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
      downloadBlob(blob, `${safeBaseName(resizeImage.file.name)}-${width}x${height}.${extension}`);
      showToast(`Downloaded resized image (${width} × ${height} px).`);
    }, type, quality);
  });

  let scanImage = null;
  function handleScanFile(files) {
    const file = Array.from(files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) {
      showToast("Choose a valid image file.");
      return;
    }
    if (scanImage) URL.revokeObjectURL(scanImage.url);
    const url = URL.createObjectURL(file);
    const preview = document.createElement("img");
    preview.src = url;
    preview.alt = `Preview of ${file.name}`;
    preview.onload = () => {
      $("#scan-preview").replaceChildren(preview);
      $("#scan-preview").classList.remove("hidden");
      scanImage = { file, url };
      $("#scan-button").disabled = false;
      $("#scan-status").textContent = "";
    };
    preview.onerror = () => {
      URL.revokeObjectURL(url);
      showToast("Could not read that image.");
    };
  }
  bindDropzone(".scan-card .compact-dropzone", "#scan-input", handleScanFile);
  $("#scan-button").addEventListener("click", async () => {
    if (!scanImage) return;
    if (!window.Tesseract) {
      showToast("The text scanner did not load. Check your internet connection and reload.");
      return;
    }
    const button = $("#scan-button");
    button.disabled = true;
    $("#scan-status").textContent = "Preparing text scanner…";
    try {
      const language = $("#scan-language").value;
      const worker = await Tesseract.createWorker(language, 1, {
        logger: (progress) => {
          if (progress.status === "recognizing text") {
            $("#scan-status").textContent = `Scanning image… ${Math.round((progress.progress || 0) * 100)}%`;
          } else if (progress.status) {
            $("#scan-status").textContent = `${progress.status}…`;
          }
        }
      });
      const { data } = await worker.recognize(scanImage.file);
      await worker.terminate();
      $("#scan-result").value = data.text.trim();
      $("#copy-text").disabled = !data.text.trim();
      $("#download-text").disabled = !data.text.trim();
      $("#scan-status").textContent = data.text.trim() ? "Scan complete. You can edit the text above." : "No text found. Try a clearer image.";
    } catch (error) {
      console.error("Could not scan image", error);
      $("#scan-status").textContent = "Scanning failed. Check your connection and try again.";
    } finally {
      button.disabled = false;
    }
  });
  $("#copy-text").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#scan-result").value);
      showToast("Text copied to clipboard.");
    } catch (error) {
      console.error("Could not copy text", error);
      showToast("Clipboard access is unavailable in this browser.");
    }
  });
  $("#download-text").addEventListener("click", () => {
    const text = $("#scan-result").value;
    if (text.trim()) downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "scanned-text.txt");
  });
  $("#scan-result").addEventListener("input", () => {
    const enabled = Boolean($("#scan-result").value.trim());
    $("#copy-text").disabled = !enabled;
    $("#download-text").disabled = !enabled;
  });

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  async function handlePdfFile(files) {
    const file = Array.from(files).find((candidate) => candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf"));
    if (!file) {
      showToast("Choose a valid PDF file.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast("This PDF is larger than the 100 MB limit.");
      return;
    }
    if (!window.PDFLib || !window.pdfjsLib) {
      showToast("PDF tools did not load. Check your internet connection and reload.");
      return;
    }
    try {
      pdfDocumentBytes = await file.arrayBuffer();
      currentPdfName = safeBaseName(file.name);
      const rendered = await pdfjsLib.getDocument({ data: pdfDocumentBytes.slice(0) }).promise;
      pdfPages = [];
      for (let pageNumber = 1; pageNumber <= rendered.numPages; pageNumber += 1) {
        const page = await rendered.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.42 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare PDF page preview.");
        await page.render({ canvasContext: context, viewport }).promise;
        pdfPages.push({ pageNumber: pageNumber - 1, rotation: 0, canvas });
      }
      $("#pdf-name").textContent = file.name;
      $("#page-count").textContent = `${pdfPages.length} ${pdfPages.length === 1 ? "page" : "pages"}`;
      $("#editor-dropzone").classList.add("hidden");
      $("#editor-workspace").classList.remove("hidden");
      renderPdfPages();
    } catch (error) {
      console.error("Could not open PDF", error);
      showToast("Could not open this PDF. It may be damaged or password-protected.");
      pdfDocumentBytes = null;
    }
  }

  bindDropzone("#editor-dropzone", "#pdf-input", handlePdfFile);

  function renderPdfPages() {
    const grid = $("#page-grid");
    grid.replaceChildren();
    pdfPages.forEach((page, index) => {
      const card = document.createElement("article");
      card.className = "page-card";
      card.draggable = true;
      card.dataset.index = index;
      const canvasWrap = document.createElement("div");
      canvasWrap.className = "page-canvas-wrap";
      const canvas = page.canvas;
      canvas.style.transform = `rotate(${page.rotation}deg)`;
      canvasWrap.append(canvas);
      const controls = document.createElement("div");
      controls.className = "page-controls";
      const number = document.createElement("span");
      number.className = "page-number";
      number.textContent = `Page ${index + 1}`;
      const rotate = document.createElement("button");
      rotate.className = "page-control";
      rotate.type = "button";
      rotate.title = "Rotate clockwise";
      rotate.setAttribute("aria-label", `Rotate page ${index + 1}`);
      rotate.textContent = "↻";
      rotate.addEventListener("click", () => {
        page.rotation = (page.rotation + 90) % 360;
        renderPdfPages();
      });
      const remove = document.createElement("button");
      remove.className = "page-control delete";
      remove.type = "button";
      remove.title = "Remove page";
      remove.setAttribute("aria-label", `Remove page ${index + 1}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        pdfPages.splice(index, 1);
        renderPdfPages();
      });
      controls.append(number, rotate, remove);
      card.append(canvasWrap, controls);
      card.addEventListener("dragstart", (event) => {
        card.classList.add("dragging");
        event.dataTransfer.setData("text/plain", String(index));
        event.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("dragover", (event) => {
        event.preventDefault();
        card.classList.add("drag-target");
      });
      card.addEventListener("dragleave", () => card.classList.remove("drag-target"));
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        card.classList.remove("drag-target");
        const from = Number(event.dataTransfer.getData("text/plain"));
        const to = index;
        if (Number.isInteger(from) && from !== to && pdfPages[from]) {
          const [moved] = pdfPages.splice(from, 1);
          pdfPages.splice(to, 0, moved);
          renderPdfPages();
        }
      });
      grid.append(card);
    });
    $("#page-count").textContent = `${pdfPages.length} ${pdfPages.length === 1 ? "page" : "pages"}`;
    $("#save-pdf").disabled = pdfPages.length === 0;
  }

  $("#save-pdf").addEventListener("click", async () => {
    if (!pdfDocumentBytes || !pdfPages.length) {
      showToast("Keep at least one page before downloading.");
      return;
    }
    const button = $("#save-pdf");
    button.disabled = true;
    button.firstChild.textContent = "Preparing PDF… ";
    try {
      const source = await PDFLib.PDFDocument.load(pdfDocumentBytes);
      const output = await PDFLib.PDFDocument.create();
      for (const pageData of pdfPages) {
        const [copied] = await output.copyPages(source, [pageData.pageNumber]);
        copied.setRotation(PDFLib.degrees((copied.getRotation().angle + pageData.rotation) % 360));
        output.addPage(copied);
      }
      const bytes = await output.save();
      downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${currentPdfName}-edited.pdf`);
      showToast(`Downloaded edited PDF with ${pdfPages.length} ${pdfPages.length === 1 ? "page" : "pages"}.`);
    } catch (error) {
      console.error("Could not save edited PDF", error);
      showToast("Could not save the edited PDF.");
    } finally {
      button.disabled = pdfPages.length === 0;
      button.firstChild.textContent = "Download edited PDF ";
    }
  });
})();
