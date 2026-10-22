import { mapItems } from "./map-data.js";

let content, request;
export const getCaseContent = () => content;
// Share one request; allow retry after failure.
export const loadCaseContent = () => {
  if (request) return request;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 10_000);
  request = fetch(import.meta.resolve("./case-content.json"), { signal: controller.signal })
  .then(response => {
    if (!response.ok) throw new Error("Case content unavailable");
    return response.json();
  })
  .then(data => {
    for (const item of mapItems) {
      item.description = data.descriptions[item.id] || item.description;
      item.figures = data.figures[item.id] || [];
    }
    document.getElementById("light-study").innerHTML = data.studies["light-study"];
    return content = data;
  })
  .catch(error => {
    request = null; throw error;
  })
  .finally(() => clearTimeout(deadline));
  return request;
};
