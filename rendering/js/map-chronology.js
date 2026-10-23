// Shared orientation of dated families in the live map and its illustrations.
const timeGroupSectors = {
  garage: {
    parent: 2.1,
    compactParent: 2.1,
    children: [1.6, 1.85, 2.35, 2.6],
    compactChildren: [1.6, 1.85, 2.35, 2.6],
    order: ["garage-site", "collection", "narkomfin", "garage-app"],
  },
  "private-practice": {
    parent: -0.32,
    compactParent: -0.55,
    children: [0.02, 0.3, 0.58, 0.86, 1.14, 1.42, 1.7, 1.98, 2.26, 2.54],
    compactChildren: [-0.08, 0.25, 0.58, 0.91, 1.24, 1.57, 1.9, 2.23, 2.56, 2.89],
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

// Place the five period captions against the rendered glyphs, including the
// compact map's perspective. Prefer above; keep the museum's glow unobscured.
export const placeTimeCaptions = (root, labels, buttons) => {
  const field=root.getBoundingClientRect(),scale=field.width/root.clientWidth;
  if(!scale)return;
  const placed=[];
  for(const [id,label] of labels){
    if(!label.hasAttribute('data-time-anchor'))continue;
    const r=buttons.get(id).querySelector('.map-node__glyph').getBoundingClientRect();
    const x=(r.left+r.width/2-field.left)/scale,y=(r.top+r.height/2-field.top)/scale;
    const w=label.offsetWidth,h=label.offsetHeight,gap=r.height/scale/2+12;
    const top=y-gap-h,bottom=y+gap;
    const candidates=(id==='garage'?[bottom,top]:[top,bottom]).map(y=>({x:Math.max(8,Math.min(root.clientWidth-w-8,x-w/2)),y:Math.max(8,Math.min(root.clientHeight-h-8,y)),w,h}));
    const rect=candidates.find(a=>!placed.some(b=>a.x<b.x+b.w+6&&a.x+a.w+6>b.x&&a.y<b.y+b.h+6&&a.y+a.h+6>b.y))||candidates[0];
    placed.push(rect);
    label.style.setProperty('--time-caption-x',`${rect.x-label.offsetLeft}px`);
    label.style.setProperty('--time-caption-y',`${rect.y-label.offsetTop}px`);
  }
};
