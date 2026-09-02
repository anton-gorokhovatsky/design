// User-initiated personal video. No third-party request is made before Play.
export const createPersonalMedia = ({ inspector, returnFocus }) => {
  const root = document.querySelector("[data-personal-media]");
  const slot = document.querySelector("[data-personal-media-slot]");
  const launch = document.querySelector("[data-open-personal-media]");
  const mapLink = document.querySelector("[data-map-link]");
  const screen = root?.querySelector("[data-personal-media-screen]");
  const poster = root?.querySelector("[data-play-personal-media]");
  const image = root?.querySelector("[data-personal-media-poster]");
  const source = root?.querySelector("[data-personal-media-source]");
  const status = root?.querySelector("[data-personal-media-status]");
  const closeButton = root?.querySelector("[data-close-personal-media]");
  if (!root || !slot || !launch || !screen || !poster || !image || !source) {
    return { select: () => {} };
  }

  const home = root.parentElement;
  // A side-by-side card and player need more space than the mobile dock alone.
  const inlineLayout = window.matchMedia("(max-width: 1024px)");
  let selectedItem = null;
  let mediaItem = null;
  let iframe = null;

  const sync = () => {
    const visible = !root.hidden;
    slot.hidden = !visible || !inlineLayout.matches;
    launch.hidden = !selectedItem?.youtube || (visible && inlineLayout.matches);
    launch.textContent = !visible
      ? "ПОКАЗАТЬ СТРИМ"
      : iframe
        ? "К\u00a0ПЛЕЕРУ"
        : "ВКЛЮЧИТЬ СТРИМ";
    launch.setAttribute("aria-expanded", String(visible));
    if (selectedItem?.youtube && mapLink) mapLink.hidden = true;
  };

  const stop = () => {
    // Removing the browsing context stops sound even if YouTube is blocked,
    // buffering, paused, or not responding to player API commands.
    iframe?.remove();
    iframe = null;
    poster.hidden = false;
    root.dataset.state = "preview";
    if (status) status.textContent = "";
  };

  const close = ({ restoreFocus = false } = {}) => {
    const focusWasInside = root.contains(document.activeElement);
    stop();
    root.hidden = true;
    sync();
    if (restoreFocus || focusWasInside) {
      if (!launch.hidden && inspector?.classList.contains("is-open")) {
        launch.focus({ preventScroll: true });
      } else {
        returnFocus?.();
      }
    }
  };

  const place = () => {
    const parent = inlineLayout.matches ? slot : home;
    if (root.parentElement !== parent) {
      // Reparenting an iframe can reload it. Never silently restart audio.
      stop();
      parent.append(root);
    }
    sync();
  };

  const show = (item = selectedItem) => {
    if (!item?.youtube || !/^[\w-]{11}$/.test(item.youtube.videoId)) return;
    if (mediaItem?.youtube.videoId !== item.youtube.videoId) stop();
    mediaItem = item;
    root.setAttribute("aria-label", item.youtube.title);
    poster.setAttribute("aria-label", "Включить стрим: " + item.youtube.title);
    source.setAttribute("aria-label", "Смотреть на YouTube: " + item.youtube.title);
    source.href = item.href;
    // The official thumbnail is first-party; opening the point stays private.
    if (image.getAttribute("src") !== item.youtube.poster) {
      image.src = item.youtube.poster;
    }
    root.hidden = false;
    place();
  };

  const play = () => {
    if (!mediaItem?.youtube) return;
    if (iframe) {
      iframe.focus({ preventScroll: true });
      return;
    }
    const url = new URL(
      "https://www.youtube-nocookie.com/embed/" + mediaItem.youtube.videoId,
    );
    url.search = new URLSearchParams({
      autoplay: "1",
      playsinline: "1",
      rel: "0",
      hl: "ru",
      origin: window.location.origin,
    }).toString();

    const frame = document.createElement("iframe");
    frame.title = mediaItem.youtube.title;
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.src = url.href;
    frame.addEventListener("load", () => {
      if (iframe === frame && status) status.textContent = "Плеер YouTube открыт";
    }, { once: true });
    frame.addEventListener("error", () => {
      if (iframe === frame && status) {
        status.textContent = "Плеер недоступен. Запись можно открыть по\u00a0ссылке на\u00a0YouTube.";
      }
    }, { once: true });
    iframe = frame;
    poster.hidden = true;
    root.dataset.state = "player";
    if (status) status.textContent = "Загружается плеер YouTube";
    screen.append(frame);
    sync();
    frame.focus({ preventScroll: true });
  };

  const select = (item) => {
    selectedItem = item || null;
    if (item?.youtube) {
      show(item);
    } else if (inlineLayout.matches || !iframe) {
      close();
    }
    sync();
  };

  launch.addEventListener("click", () => {
    if (root.hidden) {
      show();
      poster.focus({ preventScroll: true });
    } else {
      play();
    }
  });
  poster.addEventListener("click", play);
  closeButton?.addEventListener("click", () => close({ restoreFocus: true }));
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close({ restoreFocus: true });
  });
  inlineLayout.addEventListener("change", () => {
    if (!selectedItem?.youtube) close();
    place();
  });
  // A content panel leaves the map. Do not keep an inaudible-to-find player
  // underneath it; persistence is intentionally limited to exploring map points.
  const panelObserver = new MutationObserver(() => {
    if (document.body.classList.contains("has-content-panel") && !root.hidden) {
      close();
    }
  });
  panelObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("pagehide", () => close());
  place();
  return { select };
};
