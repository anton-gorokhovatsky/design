import { mapItems } from "./map-data.js";

const retry = document.querySelector("[data-load-map-study]");
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
    for (const id of ["map-making", "light-study"]) document.getElementById(id).innerHTML = data.studies[id];
    return content = data;
  })
  .catch(error => {
    document.querySelector("#map-study-status")?.replaceChildren("Не удалось загрузить разбор.");
    retry.hidden = false;
    request = null; throw error;
  })
  .finally(() => clearTimeout(deadline));
  return request;
};

retry.onclick = () => location.reload();
