export const reelChapterFrame = Object.freeze({
  width: 450,
  height: 300,
});

export const reelChapterSpecs = [
  {
    itemId: "garage-site",
    master: "garage-site.mp4",
    chapters: [
      { label: "exhibition", start: 0.2, duration: 3.1 },
      { label: "calendar-media", start: 3.4, duration: 4.1 },
    ],
  },
  {
    itemId: "narkomfin",
    master: "narkomfin.mp4",
    chapters: [
      { label: "day-camera-routes", start: 0.2, duration: 7.4 },
      { label: "night-roof", start: 8.6, duration: 4.4 },
    ],
  },
  {
    itemId: "collection",
    master: "garage-collection.mp4",
    chapters: [
      { label: "catalogue", start: 0.1, duration: 3.2 },
      { label: "works-footer", start: 3.4, duration: 4.1 },
    ],
  },
  {
    itemId: "garage-courses",
    master: "garage-courses.mp4",
    chapters: [
      { label: "identity", start: 0.1, duration: 2.9 },
      { label: "course-grid", start: 3.1, duration: 4.4 },
    ],
  },
  {
    itemId: "garage-webzine",
    master: "garage-webzine.mp4",
    chapters: [
      { label: "cover", start: 0.1, duration: 2.5 },
      { label: "reading", start: 2.7, duration: 4.8 },
    ],
  },
  {
    itemId: "shirokostup",
    master: "shirokostup.mp4",
    chapters: [
      { label: "intro-projects", start: 0.1, duration: 4 },
      { label: "archive-reading", start: 3.2, duration: 4.3 },
    ],
  },
  {
    itemId: "tarski",
    master: "tarski.mp4",
    chapters: [
      { label: "light-editorial", start: 0.2, duration: 4.7 },
      { label: "dark-network-dossier", start: 5.4, duration: 6.6 },
    ],
  },
  {
    itemId: "herman",
    master: "herman.mp4",
    chapters: [
      { label: "status", start: 0.1, duration: 2.2 },
      { label: "service-film", start: 2.5, duration: 5 },
    ],
  },
  {
    itemId: "dusty",
    master: "dusty-merch.mp4",
    chapters: [
      { label: "collection", start: 0.1, duration: 2.4 },
      { label: "product-delivery", start: 2.7, duration: 4.8 },
    ],
  },
  {
    itemId: "dd-camp",
    master: "dusty-camp.mp4",
    chapters: [
      { label: "hero", start: 0.1, duration: 2.9 },
      { label: "programme-place", start: 3.1, duration: 4.4 },
    ],
  },
  {
    itemId: "eleven",
    master: "11111.mp4",
    chapters: [
      { label: "menu", start: 1.1, duration: 3.6 },
      { label: "partners", start: 7, duration: 4.7 },
    ],
  },
  {
    itemId: "ks-fish",
    master: "ks-fish.mp4",
    chapters: [
      { label: "hero-story", start: 0.1, duration: 2.6 },
      { label: "products-prices", start: 2.9, duration: 4.6 },
    ],
  },
  {
    itemId: "doronin",
    master: "doronin.mp4",
    chapters: [
      { label: "campaign", start: 0.1, duration: 2.3 },
      { label: "assortment", start: 2.6, duration: 4.9 },
    ],
  },
];

export const getReelChapterFileName = (spec, chapterIndex) => (
  `${spec.master.replace(/\.mp4$/i, "")}-${String(chapterIndex + 1).padStart(2, "0")}.mp4`
);
