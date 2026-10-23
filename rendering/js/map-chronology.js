// Shared orientation of dated families in the live map and its illustrations.
const timeGroupSectors = {
  garage: {
    parent: 2.1,
    compactParent: 2.1,
    children: [1.3, 1.55, 2.7, 2.95],
    compactChildren: [1.3, 1.55, 2.7, 2.95],
    order: ["garage-site", "collection", "narkomfin", "garage-app"],
  },
  "private-practice": {
    parent: -0.32,
    compactParent: -0.55,
    children: [-1.4, -1.12, -.84, -.56, -.28, 0, .28, .56, .84, 1.12],
    compactChildren: [-1.4, -1.12, -.84, -.56, -.28, 0, .28, .56, .84, 1.12],
    order: [
      "shirokostup",
      "dusty",
      "tarski",
      "ks-fish",
      "herman",
      "dd-camp",
      "hotline-camp",
      "doronin",
      "eleven",
      "krainiuk",
    ],
  },
};

const timeRootAngles = {
  optimal: [1.25, 1.25],
  "early-career": [-2.3, -2.08],
  ilmix: [2.9, 2.9],
};

export const getTimeAngle = (item, compact = false) => {
  const groupId = item.parent && timeGroupSectors[item.parent]
    ? item.parent
    : timeGroupSectors[item.id]
      ? item.id
      : null;

  if (!groupId) {
    return timeRootAngles[item.id]?.[compact ? 1 : 0] ?? null;
  }

  const sector = timeGroupSectors[groupId];

  if (item.id === groupId) {
    return compact ? sector.compactParent : sector.parent;
  }

  const index = sector.order.indexOf(item.id);
  const angles = compact ? sector.compactChildren : sector.children;

  return angles[index] ?? sector.parent;
};


export const getTimeLayout = (item, compact) => {
  if (!Number.isFinite(item.timeYear)) {
    return { x: item.x, y: item.y };
  }

  const centerX = 50;
  const centerY = 54;
  const year = item.timeYear;
  const radiusX = year >= 2021
    ? 22 + (2026 - year) * 2.4
    : year >= 2015
      ? 34 + (2021 - year) * 1.83
      : 45 + Math.max(0, Math.min(1, (2015 - year) / 5)) * 11;
  const radiusY = year >= 2021
    ? 17 + (2026 - year) * 1.6
    : year >= 2015
      ? 25 + (2021 - year) * 1.33
      : 33 + Math.max(0, Math.min(1, (2015 - year) / 5)) * 8;
  const angle = getTimeAngle(item, compact) ?? Math.atan2((item.y-centerY)/34,(item.x-centerX)/44);

  return {
    x: centerX + Math.cos(angle) * radiusX,
    y: centerY + Math.sin(angle) * radiusY,
  };
};
