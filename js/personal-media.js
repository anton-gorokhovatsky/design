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
  const title = root?.querySelector("[data-personal-media-title]");
  const caption = root?.querySelector("[data-personal-media-caption]");
  const status = root?.querySelector("[data-personal-media-status]");
  const episodes = root?.querySelector("[data-personal-media-episodes]");
  if (!root || !slot || !launch || !screen || !poster || !image || !source) {
    return { select: () => {} };
  }

  let selectedItem = null;
  let mediaItem = null;
  let iframe = null;

  const sync = () => {
    const visible = !root.hidden;
    slot.hidden = !visible;
    launch.hidden = true;
    launch.setAttribute("aria-expanded", String(visible));
    if (selectedItem?.youtube && mapLink) mapLink.hidden = !selectedItem.youtube.href;
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
    if (root.parentElement !== slot) slot.append(root);
    sync();
  };

  const show = (item = selectedItem, index = 0) => {
    const media = item?.youtube?.episodes?.[index] || item?.youtube;
    if (!media || !/^[\w-]{11}$/.test(media.videoId)) return;
    if (mediaItem?.videoId !== media.videoId) stop();
    mediaItem = media;
    root.setAttribute("aria-label", media.title);
    poster.setAttribute("aria-label", "Смотреть видео: " + media.title);
    source.setAttribute("aria-label", "Открыть на YouTube: " + media.title);
    source.href = media.href || item.href;
    if (title) title.textContent = media.displayTitle || media.title;
    if (caption) caption.textContent = media.caption || item.youtube.caption || "";
    episodes?.querySelectorAll("button").forEach((button, position) => {
      button.setAttribute("aria-pressed", String(position === index));
    });
    // The official thumbnail is first-party; opening the point stays private.
    if (image.getAttribute("src") !== media.poster) {
      image.src = media.poster;
    }
    root.hidden = false;
    place();
  };

  const play = () => {
    if (!mediaItem) return;
    if (iframe) {
      iframe.focus({ preventScroll: true });
      return;
    }
    const url = new URL(
      "https://www.youtube-nocookie.com/embed/" + mediaItem.videoId,
    );
    url.search = new URLSearchParams({
      autoplay: "1",
      playsinline: "1",
      rel: "0",
      hl: "ru",
      origin: window.location.origin,
    }).toString();

    const frame = document.createElement("iframe");
    frame.title = mediaItem.title;
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
    if (episodes) {
      const parts = item?.youtube?.episodes || [];
      episodes.hidden = parts.length < 2;
      episodes.replaceChildren(...parts.map((part, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "text-link";
        button.textContent = part.label;
        button.addEventListener("click", () => show(item, index));
        return button;
      }));
    }
    if (item?.youtube) {
      show(item);
    } else {
      close();
    }
    sync();
  };

  launch.addEventListener("click", () => {
    show();
    poster.focus({ preventScroll: true });
  });
  poster.addEventListener("click", play);
  // The stream belongs to the YouTube card and stops when that card closes.
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
