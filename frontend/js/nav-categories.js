// frontend/js/nav-categories.js
// Shared top navigation category loader for /home.html and /product.html.
(() => {
  const API_BASE = '/api';

  /**
   * Render categories into the top nav list: `.main-nav .categories-list`.
   * Adds "Home" plus category links to `home.html?catid=...` (same directory as this site root).
   *
   * @param {Object} [options]
   * @param {string|number|null} [options.activeCatid] If provided, marks that category link as active.
   * @returns {Promise<Array<{catid: number|string, name: string}>>}
   */
  window.loadCategoriesIntoNav = async function loadCategoriesIntoNav(options = {}) {
    const listEl = document.querySelector('.main-nav .categories-list');
    if (!listEl) return [];

    const params = new URLSearchParams(window.location.search);
    const activeCatid = options.activeCatid ?? params.get('catid');

    try {
      const res = await fetch(`${API_BASE}/categories`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const categories = await res.json();

      listEl.textContent = '';
      const homeLi = document.createElement('li');
      const homeA = document.createElement('a');
      homeA.href = 'home.html';
      homeA.textContent = 'Home';
      homeLi.appendChild(homeA);
      listEl.appendChild(homeLi);

      if (!Array.isArray(categories) || categories.length === 0) {
        return [];
      }

      categories.forEach((cat) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `home.html?catid=${encodeURIComponent(cat.catid)}`;
        if (activeCatid != null && String(activeCatid) === String(cat.catid)) {
          a.classList.add('active');
        }
        a.textContent = String(cat.name || '');
        li.appendChild(a);
        listEl.appendChild(li);
      });
      return categories;
    } catch (e) {
      console.error('Failed to load categories for top nav:', e);
      listEl.textContent = '';
      const homeLi = document.createElement('li');
      const homeA = document.createElement('a');
      homeA.href = 'home.html';
      homeA.textContent = 'Home';
      homeLi.appendChild(homeA);
      listEl.appendChild(homeLi);
      return [];
    }
  };
})();
