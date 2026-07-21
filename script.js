const motionEasing = {
  enter: "cubic-bezier(0, 0, 0.58, 1)",
  exit: "cubic-bezier(0.42, 0, 1, 1)",
  move: "cubic-bezier(0.42, 0, 0.58, 1)",
};

const themeToggle = document.querySelector("[data-theme-toggle]");
const themeColor = document.querySelector('meta[name="theme-color"]');
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const themeReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let savedTheme = null;
let themeTransition = null;

try {
  const preference = window.localStorage.getItem("anton-theme");
  savedTheme = preference === "light" || preference === "dark" ? preference : null;
} catch {
  savedTheme = null;
}

const updateThemeColor = (item = document.querySelector(".symbol-item.is-active")) => {
  const isDark = document.documentElement.dataset.theme === "dark";
  const background = isDark
    ? (item?.dataset.bgDark || "#171817")
    : (item?.dataset.bg || "#f8f8f6");

  themeColor?.setAttribute("content", background);
};

const commitTheme = (theme) => {
  const isDark = theme === "dark";
  const actionLabel = isDark ? "Включить светлую тему" : "Включить тёмную тему";

  document.documentElement.dataset.theme = theme;
  themeToggle?.setAttribute("aria-pressed", String(isDark));
  themeToggle?.setAttribute("aria-label", actionLabel);
  themeToggle?.setAttribute("title", isDark ? "Светлая тема" : "Тёмная тема");
  updateThemeColor();
};

const applyTheme = (theme, options = {}) => {
  const { animate = false, persist = false } = options;

  if (persist) {
    savedTheme = theme;

    try {
      window.localStorage.setItem("anton-theme", theme);
    } catch {
      // Theme switching still works when storage is unavailable.
    }
  }

  const update = () => commitTheme(theme);

  if (
    animate
    && !themeReduceMotion.matches
    && typeof document.startViewTransition === "function"
    && !themeTransition
  ) {
    document.documentElement.classList.add("is-theme-transition");
    themeTransition = document.startViewTransition(update);
    themeTransition.finished.finally(() => {
      document.documentElement.classList.remove("is-theme-transition");
      themeTransition = null;
    });
  } else {
    update();
  }
};

const initialTheme = savedTheme
  || document.documentElement.dataset.theme
  || (systemTheme.matches ? "dark" : "light");

commitTheme(initialTheme);

themeToggle?.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme, { animate: true, persist: true });
});

systemTheme.addEventListener?.("change", (event) => {
  if (!savedTheme) {
    applyTheme(event.matches ? "dark" : "light", { animate: true });
  }
});

const instrument = document.querySelector("[data-symbol-instrument]");

if (instrument) {
  const stage = document.querySelector(".symbol-stage");
  const rail = instrument.querySelector(".symbol-rail");
  const items = Array.from(instrument.querySelectorAll(".symbol-item"));
  const cloneRows = () => items.map((item, index) => {
    const row = document.createElement("li");
    const clone = document.createElement("span");

    row.setAttribute("aria-hidden", "true");
    clone.className = item.className;
    clone.dataset.symbolIndex = String(index);
    clone.setAttribute("aria-hidden", "true");
    clone.innerHTML = item.innerHTML;
    row.append(clone);
    return row;
  });

  rail.prepend(...cloneRows());
  rail.append(...cloneRows());

  items.forEach((item, index) => {
    item.dataset.symbolIndex = String(index);
  });

  const visualItems = Array.from(rail.querySelectorAll(".symbol-item"));
  const previousButton = instrument.querySelector(".rail-button--prev");
  const nextButton = instrument.querySelector(".rail-button--next");
  const readout = instrument.querySelector(".symbol-readout");
  const readoutContent = instrument.querySelector(".readout-content");
  const title = document.querySelector("#symbol-title");
  const meta = document.querySelector("#symbol-meta");
  const link = readout;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let activeIndex = -1;
  let scrollFrame = 0;
  let resizeFrame = 0;
  let railAnimationFrame = 0;
  let railMotionTimer = 0;
  let settleTimer = 0;
  let readoutAnimation = null;
  let readoutContentAnimation = null;
  let readoutToken = 0;

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const easeOutCubic = (progress) => 1 - Math.pow(1 - progress, 3);

  const markRailInMotion = () => {
    rail.classList.add("is-in-motion");
    window.clearTimeout(railMotionTimer);
    railMotionTimer = window.setTimeout(() => {
      rail.classList.remove("is-in-motion");
    }, 120);
  };

  const itemTarget = (item) => {
    const railRect = rail.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return rail.scrollLeft + itemRect.left + itemRect.width / 2 - railRect.left - railRect.width / 2;
  };

  const findNearestVisualItem = () => {
    const railCenter = rail.getBoundingClientRect().left + rail.clientWidth / 2;
    let nearestItem = visualItems[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    visualItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - railCenter);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestItem = item;
      }
    });

    return nearestItem;
  };

  const nearestInstance = (index) => {
    let nearestItem = items[index];
    let nearestDistance = Number.POSITIVE_INFINITY;

    visualItems.forEach((item) => {
      if (Number(item.dataset.symbolIndex) !== index) {
        return;
      }

      const distance = Math.abs(itemTarget(item) - rail.scrollLeft);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestItem = item;
      }
    });

    return nearestItem;
  };

  const normalizeLoopPosition = () => {
    const nearestItem = findNearestVisualItem();
    const visualIndex = visualItems.indexOf(nearestItem);
    const cycleWidth = itemTarget(visualItems[items.length]) - itemTarget(visualItems[0]);

    if (visualIndex < items.length) {
      rail.scrollLeft += cycleWidth;
    } else if (visualIndex >= items.length * 2) {
      rail.scrollLeft -= cycleWidth;
    }
  };

  const updateProximity = () => {
    const railRect = rail.getBoundingClientRect();
    const railCenter = railRect.left + railRect.width / 2;
    const falloff = Math.max(150, railRect.width * 0.42);

    visualItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const signedDistance = rect.left + rect.width / 2 - railCenter;
      const distance = Math.abs(signedDistance);
      const normalizedDistance = clamp(signedDistance / falloff, -1, 1);
      const proximity = Math.pow(clamp(1 - distance / falloff, 0, 1), 0.78);
      const rotation = Math.sign(normalizedDistance)
        * Math.pow(Math.abs(normalizedDistance), 0.86)
        * 2.8;

      item.style.setProperty("--symbol-opacity", (0.16 + proximity * 0.84).toFixed(3));
      item.style.setProperty("--symbol-scale", (0.72 + proximity * 0.44).toFixed(3));
      item.style.setProperty("--symbol-lift", `${(-11 * proximity).toFixed(2)}px`);
      item.style.setProperty("--symbol-rotate", `${rotation.toFixed(2)}deg`);
      item.style.setProperty("--symbol-grayscale", (0.32 - proximity * 0.32).toFixed(3));
      item.style.setProperty("--symbol-saturation", (0.7 + proximity * 0.35).toFixed(3));
    });
  };

  const centerItem = (item, immediate = false) => {
    window.cancelAnimationFrame(railAnimationFrame);
    railAnimationFrame = 0;

    const start = rail.scrollLeft;
    const target = itemTarget(item);
    const distance = target - start;

    markRailInMotion();

    if (immediate || reduceMotion.matches || Math.abs(distance) < 1) {
      rail.scrollLeft = target;
      normalizeLoopPosition();
      updateProximity();
      return;
    }

    const startedAt = performance.now();
    const duration = clamp(360 + Math.abs(distance) * 0.24, 360, 620);

    const animate = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      rail.scrollLeft = start + distance * easeOutCubic(progress);
      updateProximity();

      if (progress < 1) {
        railAnimationFrame = window.requestAnimationFrame(animate);
      } else {
        railAnimationFrame = 0;
        normalizeLoopPosition();
        updateProximity();
      }
    };

    railAnimationFrame = window.requestAnimationFrame(animate);
  };

  const applyReadout = (item) => {
    const href = item.dataset.href || "";
    title.textContent = item.dataset.title || "";
    meta.textContent = item.dataset.meta || "";

    if (href) {
      link.classList.add("is-linked");
      link.href = href;
      link.setAttribute("aria-label", `Открыть: ${item.dataset.title}`);

      if (href.startsWith("mailto:")) {
        link.removeAttribute("target");
        link.removeAttribute("rel");
      } else {
        link.target = "_blank";
        link.rel = "noreferrer";
      }
    } else {
      link.classList.remove("is-linked");
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.removeAttribute("rel");
      link.removeAttribute("aria-label");
    }
  };

  const morphReadout = (item, animate) => {
    readoutToken += 1;
    const token = readoutToken;

    if (!animate || reduceMotion.matches || typeof readout.animate !== "function") {
      readoutAnimation?.cancel();
      readoutContentAnimation?.cancel();
      readoutAnimation = null;
      readoutContentAnimation = null;
      readout.style.width = "";
      applyReadout(item);
      return;
    }

    readoutAnimation?.cancel();
    readoutContentAnimation?.cancel();
    const startWidth = readout.getBoundingClientRect().width;

    readoutContentAnimation = readoutContent.animate(
      [
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
        { opacity: 0, transform: "scale(0.88)", filter: "blur(3px)" },
      ],
      {
        duration: 150,
        easing: motionEasing.exit,
        fill: "forwards",
      },
    );

    readoutContentAnimation.finished.then(() => {
      if (token !== readoutToken) {
        return;
      }

      applyReadout(item);
      readoutContentAnimation?.cancel();
      readout.style.width = "";
      const targetWidth = readout.getBoundingClientRect().width;
      const middleWidth = startWidth + (targetWidth - startWidth) * 0.42;

      readoutAnimation = readout.animate(
        [
          { width: `${startWidth}px`, transform: "scale(1)" },
          {
            width: `${middleWidth}px`,
            transform: "scale(0.985, 0.92)",
            offset: 0.34,
          },
          { width: `${targetWidth}px`, transform: "scale(1)" },
        ],
        {
          duration: 520,
          easing: motionEasing.move,
          fill: "both",
        },
      );

      readoutContentAnimation = readoutContent.animate(
        [
          { opacity: 0, transform: "scale(0.88)", filter: "blur(3px)" },
          { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
        ],
        {
          duration: 360,
          delay: 90,
          easing: motionEasing.enter,
          fill: "both",
        },
      );

      readoutContentAnimation.finished.then(() => {
        if (token === readoutToken) {
          readoutContentAnimation?.cancel();
          readoutContentAnimation = null;
        }
      }).catch(() => {});

      readoutAnimation.finished.then(() => {
        if (token === readoutToken) {
          readoutAnimation?.cancel();
          readoutAnimation = null;
          readout.style.width = "";
        }
      }).catch(() => {});
    }).catch(() => {});
  };

  const selectItem = (nextIndex, options = {}) => {
    const { center = true, focus = false, targetItem = null } = options;
    const index = (nextIndex % items.length + items.length) % items.length;
    const item = items[index];

    if (index !== activeIndex) {
      const shouldMorph = activeIndex >= 0;

      visualItems.forEach((candidate) => {
        const isActive = Number(candidate.dataset.symbolIndex) === index;
        candidate.classList.toggle("is-active", isActive);
      });

      items.forEach((candidate, candidateIndex) => {
        candidate.setAttribute("aria-selected", String(candidateIndex === index));
      });

      activeIndex = index;
      const background = item.dataset.bg || "#f8f8f6";
      const darkBackground = item.dataset.bgDark || "#171817";
      const foreground = item.dataset.ink || "#242421";
      const darkForeground = item.dataset.inkDark || "#f0efe9";

      stage.style.setProperty("--stage-bg-light", background);
      stage.style.setProperty("--stage-bg-dark", darkBackground);
      stage.style.setProperty("--stage-ink-light", foreground);
      stage.style.setProperty("--stage-ink-dark", darkForeground);
      updateThemeColor(item);
      morphReadout(item, shouldMorph);
    }

    if (center) {
      centerItem(targetItem || nearestInstance(index), reduceMotion.matches);
    }

    if (focus) {
      item.focus({ preventScroll: true });
    }
  };

  visualItems.forEach((item) => {
    item.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") {
        event.preventDefault();
      }
    });
    item.addEventListener("click", () => {
      selectItem(Number(item.dataset.symbolIndex), { targetItem: item });
    });
  });

  [previousButton, nextButton].forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") {
        event.preventDefault();
      }
    });
  });

  previousButton.addEventListener("click", () => selectItem(activeIndex - 1));
  nextButton.addEventListener("click", () => selectItem(activeIndex + 1));

  rail.addEventListener("scroll", () => {
    markRailInMotion();
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(() => {
      if (!railAnimationFrame) {
        normalizeLoopPosition();
      }
      updateProximity();
    });

    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (!railAnimationFrame) {
        normalizeLoopPosition();
        const nearestItem = findNearestVisualItem();
        selectItem(Number(nearestItem.dataset.symbolIndex), { center: false });
      }
    }, 160);
  }, { passive: true });

  rail.addEventListener("keydown", (event) => {
    const keyActions = {
      ArrowLeft: () => selectItem(activeIndex - 1, { focus: true }),
      ArrowRight: () => selectItem(activeIndex + 1, { focus: true }),
      Home: () => selectItem(0, { focus: true }),
      End: () => selectItem(items.length - 1, { focus: true }),
    };

    if (keyActions[event.key]) {
      event.preventDefault();
      keyActions[event.key]();
    }
  });

  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      window.cancelAnimationFrame(railAnimationFrame);
      railAnimationFrame = 0;
      centerItem(nearestInstance(activeIndex), true);
      updateProximity();
    });
  });

  selectItem(0, { center: false });
  window.requestAnimationFrame(() => centerItem(items[0], true));
}

const projectField = document.querySelector("[data-project-clouds]");

if (projectField) {
  const dragBounds = projectField.closest(".symbol-stage") || projectField;
  const projectItems = Array.from(projectField.querySelectorAll(".project-item"));
  const viewButtons = Array.from(document.querySelectorAll("[data-project-view]"));
  const viewSwitch = document.querySelector(".project-view-switch");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const resetProjects = [];
  let topLayer = 10;
  let projectResizeFrame = 0;

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

  projectField.style.viewTransitionName = "projects-field";

  projectItems.forEach((item, index) => {
    const cloud = item.querySelector("[data-project-cloud]");
    item.style.viewTransitionName = `project-${index + 1}`;
    let pointerId = null;
    let inertiaFrame = 0;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let currentX = 0;
    let currentY = 0;
    let minimumX = 0;
    let maximumX = 0;
    let minimumY = 0;
    let maximumY = 0;
    let velocityX = 0;
    let velocityY = 0;
    let lastMoveTime = 0;
    let moved = false;
    let suppressClick = false;

    const setPosition = (nextX, nextY) => {
      currentX = clamp(nextX, minimumX, maximumX);
      currentY = clamp(nextY, minimumY, maximumY);
      item.style.setProperty("--drag-x", `${currentX}px`);
      item.style.setProperty("--drag-y", `${currentY}px`);
    };

    const stopInertia = () => {
      window.cancelAnimationFrame(inertiaFrame);
      inertiaFrame = 0;
      item.classList.remove("is-settling");
    };

    const startInertia = () => {
      if (reduceMotion.matches || Math.hypot(velocityX, velocityY) < 0.04) {
        return;
      }

      item.classList.add("is-settling");
      let previousTime = performance.now();
      let elapsed = 0;

      const glide = (now) => {
        const deltaTime = Math.min(32, now - previousTime);
        const decay = Math.pow(0.84, deltaTime / 16);
        previousTime = now;
        elapsed += deltaTime;
        velocityX *= decay;
        velocityY *= decay;

        let nextX = currentX + velocityX * deltaTime;
        let nextY = currentY + velocityY * deltaTime;

        if (nextX < minimumX || nextX > maximumX) {
          nextX = clamp(nextX, minimumX, maximumX);
          velocityX *= -0.16;
        }

        if (nextY < minimumY || nextY > maximumY) {
          nextY = clamp(nextY, minimumY, maximumY);
          velocityY *= -0.16;
        }

        setPosition(nextX, nextY);

        if (Math.hypot(velocityX, velocityY) > 0.018 && elapsed < 900) {
          inertiaFrame = window.requestAnimationFrame(glide);
        } else {
          inertiaFrame = 0;
          item.classList.remove("is-settling");
        }
      };

      inertiaFrame = window.requestAnimationFrame(glide);
    };

    const finishDrag = (event) => {
      if (event.pointerId !== pointerId) {
        return;
      }

      if (cloud.hasPointerCapture(pointerId)) {
        cloud.releasePointerCapture(pointerId);
      }

      pointerId = null;
      item.classList.remove("is-dragging");

      if (moved) {
        suppressClick = true;
        if (event.type !== "pointercancel") {
          startInertia();
        }
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    };

    cloud.addEventListener("dragstart", (event) => event.preventDefault());

    cloud.addEventListener("pointerdown", (event) => {
      if (
        projectField.classList.contains("is-list")
        || event.pointerType !== "mouse"
        || event.button !== 0
        || !event.isPrimary
      ) {
        return;
      }

      const itemRect = item.getBoundingClientRect();
      const boundsRect = dragBounds.getBoundingClientRect();
      const styles = window.getComputedStyle(item);

      event.preventDefault();
      stopInertia();
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      originX = Number.parseFloat(styles.getPropertyValue("--drag-x")) || 0;
      originY = Number.parseFloat(styles.getPropertyValue("--drag-y")) || 0;
      currentX = originX;
      currentY = originY;
      minimumX = boundsRect.left + 8 - (itemRect.left - originX);
      maximumX = boundsRect.right - 8 - (itemRect.right - originX);
      minimumY = boundsRect.top + 8 - (itemRect.top - originY);
      maximumY = boundsRect.bottom - 8 - (itemRect.bottom - originY);
      velocityX = 0;
      velocityY = 0;
      lastMoveTime = performance.now();
      moved = false;

      topLayer += 1;
      item.style.zIndex = String(topLayer);
      item.classList.add("is-dragging");
      cloud.setPointerCapture(pointerId);
    });

    cloud.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) {
        return;
      }

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (!moved && Math.hypot(deltaX, deltaY) < 5) {
        return;
      }

      moved = true;
      event.preventDefault();

      const now = performance.now();
      const deltaTime = Math.max(8, now - lastMoveTime);
      const nextX = clamp(originX + deltaX, minimumX, maximumX);
      const nextY = clamp(originY + deltaY, minimumY, maximumY);
      const instantVelocityX = (nextX - currentX) / deltaTime;
      const instantVelocityY = (nextY - currentY) / deltaTime;

      velocityX = clamp(velocityX * 0.48 + instantVelocityX * 0.52, -0.72, 0.72);
      velocityY = clamp(velocityY * 0.48 + instantVelocityY * 0.52, -0.72, 0.72);
      lastMoveTime = now;
      setPosition(nextX, nextY);
    });

    cloud.addEventListener("pointerup", finishDrag);
    cloud.addEventListener("pointercancel", finishDrag);

    cloud.addEventListener("click", (event) => {
      if (!suppressClick) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    });

    resetProjects.push(() => {
      stopInertia();
      pointerId = null;
      currentX = 0;
      currentY = 0;
      suppressClick = false;
      item.classList.remove("is-dragging");
      item.style.removeProperty("--drag-x");
      item.style.removeProperty("--drag-y");
      item.style.removeProperty("z-index");
    });
  });

  const setProjectView = (nextView, options = {}) => {
    const { animate = true, persist = true } = options;
    const view = nextView === "list" ? "list" : "grid";
    const currentView = projectField.classList.contains("is-list") ? "list" : "grid";

    const updateView = () => {
      resetProjects.forEach((resetProject) => resetProject());
      projectField.classList.toggle("is-list", view === "list");
      projectField.dataset.view = view;
      viewSwitch?.setAttribute("data-view", view);

      viewButtons.forEach((button) => {
        const isActive = button.dataset.projectView === view;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
    };

    if (
      animate
      && currentView !== view
      && !reduceMotion.matches
      && typeof document.startViewTransition === "function"
    ) {
      document.startViewTransition(updateView);
    } else {
      updateView();
    }

    if (persist) {
      try {
        window.localStorage.setItem("anton-project-view", view);
      } catch {
        // The selected mode still works when storage is unavailable.
      }
    }
  };

  viewButtons.forEach((button, index) => {
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") {
        event.preventDefault();
      }
    });

    button.addEventListener("click", () => {
      setProjectView(button.dataset.projectView);
    });

    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextButton = viewButtons[(index + direction + viewButtons.length) % viewButtons.length];
      nextButton.focus();
      setProjectView(nextButton.dataset.projectView);
    });
  });

  let initialProjectView = "grid";

  try {
    initialProjectView = window.localStorage.getItem("anton-project-view") || "grid";
  } catch {
    initialProjectView = "grid";
  }

  setProjectView(initialProjectView, { animate: false, persist: false });

  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(projectResizeFrame);
    projectResizeFrame = window.requestAnimationFrame(() => {
      resetProjects.forEach((resetProject) => resetProject());
    });
  });
}
