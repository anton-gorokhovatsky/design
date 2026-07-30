#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const publicOrigin = "https://gorokhovatsky.tech";
const failures = [];
const shareRoutes = [
  {
    id: "garage",
    titleFragment: "Музей «Гараж»",
    imageAltFragment: "Музея «Гараж»",
  },
  {
    id: "narkomfin",
    titleFragment: "Дом Наркомфина",
    imageAltFragment: "Дом Наркомфина",
  },
  {
    id: "tarski",
    titleFragment: "Tarski",
    imageAltFragment: "Tarski",
  },
];

const readText = (path) => readFileSync(join(projectRoot, path), "utf8");
const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=(["'])(.*?)\\1`, "i"));
  return match?.[2] || "";
};
const tags = (source, name) => (
  [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))]
    .map((match) => match[0])
);
const metaContent = (source, key, value) => {
  const tag = tags(source, "meta").find(
    (candidate) => attribute(candidate, key) === value,
  );
  return tag ? attribute(tag, "content") : "";
};
const linkHref = (source, rel) => {
  const tag = tags(source, "link").find(
    (candidate) => attribute(candidate, "rel") === rel,
  );
  return tag ? attribute(tag, "href") : "";
};

const readJpegDimensions = (path) => {
  const file = readFileSync(path);
  if (file[0] !== 0xff || file[1] !== 0xd8) {
    throw new Error("not a JPEG");
  }

  let offset = 2;
  while (offset + 8 < file.length) {
    if (file[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (file[offset] === 0xff) offset += 1;
    const marker = file[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = file.readUInt16BE(offset);
    const isStartOfFrame = (
      marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker)
    );
    if (isStartOfFrame) {
      return {
        height: file.readUInt16BE(offset + 3),
        width: file.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }

  throw new Error("JPEG dimensions not found");
};

for (const route of shareRoutes) {
  const path = `work/${route.id}/index.html`;
  const source = readText(path);
  const canonical = `${publicOrigin}/work/${route.id}/`;
  const image = `${publicOrigin}/assets/share/${route.id}.jpg`;
  const redirect = `../../?point=${route.id}#map`;
  const title = source.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
  const description = metaContent(source, "name", "description");
  const ogTitle = metaContent(source, "property", "og:title");
  const ogDescription = metaContent(source, "property", "og:description");
  const ogImageAlt = metaContent(source, "property", "og:image:alt");

  if (
    !title.includes(route.titleFragment)
    || description.length < 80
    || !ogTitle.includes(route.titleFragment)
    || ogDescription.length < 60
  ) {
    failures.push(`${path}: title or description metadata is incomplete`);
  }
  if (
    linkHref(source, "canonical") !== canonical
    || metaContent(source, "property", "og:url") !== canonical
    || metaContent(source, "property", "og:image") !== image
    || metaContent(source, "name", "twitter:image") !== image
  ) {
    failures.push(`${path}: canonical or share URLs do not match`);
  }
  if (
    metaContent(source, "property", "og:image:width") !== "1200"
    || metaContent(source, "property", "og:image:height") !== "630"
    || !ogImageAlt.includes(route.imageAltFragment)
  ) {
    failures.push(`${path}: image dimensions or alt metadata is incomplete`);
  }
  if (
    metaContent(source, "http-equiv", "refresh") !== `0; url=${redirect}`
    || !source.includes(`window.location.replace("${redirect}")`)
    || !source.includes(`href="${redirect}"`)
  ) {
    failures.push(`${path}: redirect and accessible fallback diverge`);
  }

  const structuredDataSource = source.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i,
  )?.[1];
  try {
    const structuredData = JSON.parse(structuredDataSource || "");
    if (
      structuredData["@type"] !== "CreativeWork"
      || structuredData.url !== canonical
      || structuredData.image !== image
      || structuredData.creator?.name !== "Антон Гороховатский"
    ) {
      failures.push(`${path}: CreativeWork structured data does not match`);
    }
  } catch {
    failures.push(`${path}: CreativeWork structured data is not valid JSON`);
  }

  try {
    const dimensions = readJpegDimensions(
      join(projectRoot, "assets", "share", `${route.id}.jpg`),
    );
    if (dimensions.width !== 1200 || dimensions.height !== 630) {
      failures.push(`${path}: share image must stay 1200×630`);
    }
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

const sitemap = readText("sitemap.xml");
const robots = readText("robots.txt");
for (const route of shareRoutes) {
  const canonical = `${publicOrigin}/work/${route.id}/`;
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
    failures.push(`sitemap.xml: missing ${canonical}`);
  }
}
if (!robots.includes(`Sitemap: ${publicOrigin}/sitemap.xml`)) {
  failures.push("robots.txt: public sitemap URL is missing");
}

const pdf = readFileSync(
  join(projectRoot, "assets", "anton-gorokhovatsky-resume.pdf"),
);
const pdfSource = pdf.toString("latin1");
const pageCount = [...pdfSource.matchAll(/\/Type\s*\/Page\b/g)].length;
const linkCount = [...pdfSource.matchAll(/\/Subtype\s*\/Link\b/g)].length;
if (
  !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))
  || pageCount !== 2
  || linkCount < 5
) {
  failures.push(
    "assets/anton-gorokhovatsky-resume.pdf: expected an intact two-page draft with five links",
  );
}

if (failures.length > 0) {
  console.error("Publication asset contracts failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Publication assets passed: ${shareRoutes.length} share routes at 1200×630, `
    + `unlinked two-page PDF draft with ${linkCount} links.`,
);
