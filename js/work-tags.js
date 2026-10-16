// One vocabulary of the author's contribution for the list, case and point preview.
// Labels are grounded in the existing case roles, not inferred from a site's features.
const workTags = {
  'garage-site': ['UX-исследования', 'Веб-дизайн', 'Менеджмент'],
  narkomfin: ['UX-исследования', 'Веб-дизайн', 'Менеджмент'],
  collection: ['Проектирование', 'UX-исследования', 'Веб-дизайн', 'Менеджмент'],
  'garage-archives': ['UX-исследования', 'Прототипирование', 'Менеджмент'],
  'garage-courses': ['UX-исследования', 'Веб-дизайн', 'Разработка'],
  'garage-app': ['UX-исследования', 'Проектирование'],
  'garage-webzine': ['Веб-дизайн', 'Разработка'],
  'garage-institutions': ['Прототипирование', 'Веб-дизайн', 'Разработка', 'Консультирование'],
  shirokostup: ['Редакционная структура', 'Веб-дизайн', 'Разработка'],
  tarski: ['Проектирование', 'Веб-дизайн', 'Разработка', 'Доступность'],
  eleven: ['Концепция', 'Редакционная структура', 'Веб-дизайн', 'Разработка'],
  herman: ['Проектирование', 'Веб-дизайн', 'Разработка'],
  'ks-fish': ['Редакционная структура', 'Арт-дирекция', 'Веб-дизайн', 'Разработка'],
  ilmix: ['Продуктовая стратегия', 'Брендинг', 'Менеджмент'],
  'hotline-camp': ['Концепция', 'Веб-дизайн', 'Разработка', 'Доступность'],
  krainiuk: ['Проектирование', 'Веб-дизайн', 'Разработка'],
  doronin: ['Проектирование', 'Веб-дизайн', 'Разработка'],
};

export function createWorkTags(id) {
  const labels = workTags[id];
  if (!labels?.length) return null;
  const group = document.createElement('div');
  group.className = 'work-tags';
  const list = document.createElement('ul');
  list.className = 'work-tags__list';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Моя роль в проекте');
  for (const label of labels) {
    const item = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = label;
    item.append(text);
    list.append(item);
  }
  group.append(list);
  return group;
}

export function updateWorkTags(container, id) {
  container.querySelector(':scope > .work-tags')?.remove();
  const list = createWorkTags(id);
  if (list) container.append(list);
  return Boolean(list);
}
