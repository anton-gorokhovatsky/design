import { mapItems } from "./map-data.js";

let content, request;
export const getCaseContent = () => content;
// One request for readers and search; failed requests can be retried.
export const loadCaseContent = () => request ||= fetch(import.meta.resolve("./case-content.json"))
  .then(response => {
    if (!response.ok) throw new Error("Case content unavailable");
    return response.json();
  })
  .then(data => {
    for (const item of mapItems) {
      item.description = data.descriptions[item.id] || item.description;
      item.figures = data.figures[item.id] || [];
    }
    return content = data;
  })
  .catch(error => { request = null; throw error; });
