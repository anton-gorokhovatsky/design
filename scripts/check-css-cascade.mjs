#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const stylePath = join(projectRoot, "styles.css");
const fixMode = process.argv.includes("--fix-identical");
const reportOverridden = process.argv.includes("--report-overridden");
const overriddenRangeArgument = process.argv.find((argument) => (
  argument.startsWith("--fix-overridden-range=")
));
let source = readFileSync(stylePath, "utf8");

const skipQuotedOrComment = (text, index) => {
  if (text.startsWith("/*", index)) {
    const end = text.indexOf("*/", index + 2);
    return end === -1 ? text.length : end + 2;
  }

  const quote = text[index];
  if (quote !== "'" && quote !== '"') {
    return index;
  }

  let cursor = index + 1;
  while (cursor < text.length) {
    if (text[cursor] === "\\") {
      cursor += 2;
    } else if (text[cursor] === quote) {
      return cursor + 1;
    } else {
      cursor += 1;
    }
  }

  return text.length;
};

const findMatchingBrace = (text, openIndex) => {
  let depth = 1;
  let cursor = openIndex + 1;

  while (cursor < text.length && depth > 0) {
    const skipped = skipQuotedOrComment(text, cursor);
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }

    if (text[cursor] === "{") {
      depth += 1;
    } else if (text[cursor] === "}") {
      depth -= 1;
    }
    cursor += 1;
  }

  return depth === 0 ? cursor - 1 : -1;
};

const findRuleBoundary = (text, start, end) => {
  let parentheses = 0;
  let brackets = 0;
  let cursor = start;

  while (cursor < end) {
    const skipped = skipQuotedOrComment(text, cursor);
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }

    const character = text[cursor];
    if (character === "(") parentheses += 1;
    if (character === ")") parentheses = Math.max(0, parentheses - 1);
    if (character === "[") brackets += 1;
    if (character === "]") brackets = Math.max(0, brackets - 1);

    if (parentheses === 0 && brackets === 0 && (character === "{" || character === ";")) {
      return { index: cursor, character };
    }
    cursor += 1;
  }

  return null;
};

const splitDeclarations = (text, start, end) => {
  const declarations = [];
  let segmentStart = start;
  let parentheses = 0;
  let cursor = start;

  const pushSegment = (segmentEnd, removalEnd) => {
    let declarationStart = segmentStart;
    while (declarationStart < segmentEnd) {
      if (/\s/.test(text[declarationStart])) {
        declarationStart += 1;
        continue;
      }
      if (text.startsWith("/*", declarationStart)) {
        declarationStart = skipQuotedOrComment(text, declarationStart);
        continue;
      }
      break;
    }

    const raw = text.slice(declarationStart, segmentEnd);
    const commentFree = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    let colonIndex = -1;
    let nested = 0;
    let quote = "";

    for (let index = 0; index < commentFree.length; index += 1) {
      const character = commentFree[index];
      if (quote) {
        if (character === "\\") index += 1;
        else if (character === quote) quote = "";
      } else if (character === "'" || character === '"') {
        quote = character;
      } else if (character === "(") {
        nested += 1;
      } else if (character === ")") {
        nested = Math.max(0, nested - 1);
      } else if (character === ":" && nested === 0) {
        colonIndex = index;
        break;
      }
    }

    if (colonIndex !== -1) {
      const property = commentFree.slice(0, colonIndex).trim().toLowerCase();
      const valueSource = commentFree.slice(colonIndex + 1).trim();
      const important = /\s*!important\s*$/i.test(valueSource);
      const value = valueSource
        .replace(/\s*!important\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();

      if (/^--[a-z0-9-]+$|^-?[a-z][a-z0-9-]*$/i.test(property) && value) {
        declarations.push({
          property,
          value,
          important,
          start: declarationStart,
          end: removalEnd,
        });
      }
    }

    segmentStart = removalEnd;
  };

  while (cursor < end) {
    const skipped = skipQuotedOrComment(text, cursor);
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }

    if (text[cursor] === "(") parentheses += 1;
    if (text[cursor] === ")") parentheses = Math.max(0, parentheses - 1);
    if (text[cursor] === ";" && parentheses === 0) {
      pushSegment(cursor, cursor + 1);
    }
    cursor += 1;
  }

  if (segmentStart < end) {
    pushSegment(end, end);
  }

  return declarations;
};

const nestedAtRule = /^@(media|supports|container|layer|keyframes|-webkit-keyframes)\b/i;
const rules = [];

const parseRules = (start, end, context = []) => {
  let cursor = start;

  while (cursor < end) {
    const boundary = findRuleBoundary(source, cursor, end);
    if (!boundary) return;

    if (boundary.character === ";") {
      cursor = boundary.index + 1;
      continue;
    }

    const prelude = source.slice(cursor, boundary.index)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const closeIndex = findMatchingBrace(source, boundary.index);
    if (closeIndex === -1 || closeIndex > end) {
      throw new Error(`Unbalanced CSS block near byte ${boundary.index}.`);
    }

    if (nestedAtRule.test(prelude)) {
      parseRules(boundary.index + 1, closeIndex, [...context, prelude]);
    } else if (prelude && !prelude.startsWith("@")) {
      rules.push({
        selector: prelude,
        context: context.join(" && "),
        declarations: splitDeclarations(source, boundary.index + 1, closeIndex),
      });
    }

    cursor = closeIndex + 1;
  }
};

parseRules(0, source.length);

const lastDeclaration = new Map();
const redundantRanges = [];
const overriddenRanges = [];

for (const rule of rules) {
  for (const declaration of rule.declarations) {
    const key = [
      rule.context,
      rule.selector,
      declaration.property,
      declaration.important ? "important" : "normal",
    ].join("\n");
    const previous = lastDeclaration.get(key);

    if (previous?.value === declaration.value) {
      redundantRanges.push({
        ...previous,
        selector: rule.selector,
        context: rule.context,
      });
    } else if (previous) {
      overriddenRanges.push({
        ...previous,
        selector: rule.selector,
        context: rule.context,
        replacement: declaration,
      });
    }

    lastDeclaration.set(key, declaration);
  }
}

if (reportOverridden) {
  for (const range of overriddenRanges) {
    const line = source.slice(0, range.start).split("\n").length;
    const replacementLine = source
      .slice(0, range.replacement.start)
      .split("\n").length;
    const scope = range.context ? `${range.context} → ` : "";
    console.log(
      `styles.css:${line} → ${replacementLine} ${scope}${range.selector} { `
        + `${range.property}: ${range.value} → ${range.replacement.value}; }`,
    );
  }
  console.log(`${overriddenRanges.length} overridden declarations.`);
  process.exit(0);
}

if (overriddenRangeArgument) {
  const value = overriddenRangeArgument.split("=", 2)[1] || "";
  const [firstLine, lastLine] = value.split(":").map(Number);
  if (
    !Number.isInteger(firstLine)
    || !Number.isInteger(lastLine)
    || firstLine < 1
    || lastLine < firstLine
  ) {
    throw new Error(
      "--fix-overridden-range expects inclusive positive lines, for example 1450:2325.",
    );
  }

  const selectedRanges = overriddenRanges.filter((range) => {
    const line = source.slice(0, range.start).split("\n").length;
    return line >= firstLine && line <= lastLine;
  });
  for (const range of selectedRanges.sort((left, right) => right.start - left.start)) {
    source = source.slice(0, range.start) + source.slice(range.end);
  }
  writeFileSync(stylePath, source);
  console.log(
    `Removed ${selectedRanges.length} unconditionally overridden declarations `
      + `from original lines ${firstLine}–${lastLine}.`,
  );
  process.exit(0);
}

if (fixMode && redundantRanges.length > 0) {
  for (const range of redundantRanges.sort((left, right) => right.start - left.start)) {
    source = source.slice(0, range.start) + source.slice(range.end);
  }
  writeFileSync(stylePath, source);
  console.log(`Removed ${redundantRanges.length} identical cascade declarations.`);
  process.exit(0);
}

const fixedPixelFonts = [...source.matchAll(/font-size:\s*[0-9.]+px\s*;/g)];
const backdropValues = [
  ...source.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/g),
].map((match) => match[1].replace(/\s+/g, " ").trim());
const unexpectedBackdropValues = [...new Set(backdropValues)]
  .filter((value) => !["blur(24px)", "none"].includes(value));
const failures = [];

if (redundantRanges.length > 0) {
  failures.push(`${redundantRanges.length} identical cascade declarations remain.`);
}
if (fixedPixelFonts.length > 0) {
  failures.push(`${fixedPixelFonts.length} fixed px font-size declarations remain.`);
}
if (unexpectedBackdropValues.length > 0) {
  failures.push(`Unexpected backdrop values: ${unexpectedBackdropValues.join(", ")}.`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  for (const range of redundantRanges) {
    const line = source.slice(0, range.start).split("\n").length;
    const scope = range.context ? `${range.context} → ` : "";
    console.error(
      `  styles.css:${line} ${scope}${range.selector} { `
        + `${range.property}: ${range.value}; }`,
    );
  }
  process.exit(1);
}

console.log(
  `CSS cascade passed: ${rules.length} rules, zero identical declarations, `
  + "scalable type, one blur recipe.",
);
