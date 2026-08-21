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
      { label: "light-cover-contents", start: 0.1, duration: 4.6 },
      { label: "dark-article", start: 6.1, duration: 6.1 },
    ],
  },
  {
    itemId: "shirokostup",
    master: "shirokostup.mp4",
    chapters: [
      { label: "light-home-index", start: 0.1, duration: 4.1 },
      { label: "dark-index-work", start: 4.6, duration: 7.9 },
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
      { label: "light-profile-expertise", start: 0.2, duration: 5 },
      { label: "partnerships-dark-media-music", start: 5.3, duration: 9.2 },
    ],
  },
  {
    itemId: "hotline-camp",
    master: "hotline-camp.mp4",
    chapters: [
      { label: "solar-hero-menu-programme", start: 0.1, duration: 5.6 },
      { label: "dark-trainers-finish", start: 6.4, duration: 7.5 },
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
      { label: "hero-diary", start: 0.2, duration: 4.8 },
      { label: "dark-diary-entry", start: 7.5, duration: 4.1 },
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
