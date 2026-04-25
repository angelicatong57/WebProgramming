const API_BASE = '/api';

// Cache for product images loaded from /api/products/:pid
const productImagesCache = {};

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.querySelector('.product-grid');
  if (!grid) return;

  // Load categories into the top nav and update breadcrumb
  loadCategoriesForHome();

  try {
    const params = new URLSearchParams(window.location.search);
    const catid = params.get('catid');

    const res = await fetch(
      catid ? `${API_BASE}/products?catid=${encodeURIComponent(catid)}` : `${API_BASE}/products`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const products = await res.json();

    if (!products || products.length === 0) {
      grid.textContent = 'No products yet.';
      return;
    }

    grid.textContent = '';
    products.forEach((p) => {
      const pid = Number.parseInt(p.pid, 10);
      if (!Number.isFinite(pid)) return;

      const article = document.createElement('article');
      article.className = 'product-item';

      const thumbLink = document.createElement('a');
      thumbLink.href = `product.html?pid=${encodeURIComponent(pid)}`;
      thumbLink.className = 'product-thumbnail';
      thumbLink.dataset.pid = String(pid);

      const thumbnailSrc = safeImagePath(p.thumbnail_path);
      if (thumbnailSrc) {
        const img = document.createElement('img');
        img.src = thumbnailSrc;
        img.alt = String(p.name || '');
        img.className = 'product-thumb-img';
        thumbLink.appendChild(img);
      } else {
        const noImage = document.createElement('div');
        noImage.className = 'no-image-placeholder';
        noImage.textContent = 'No Image';
        thumbLink.appendChild(noImage);
      }

      const arrows = document.createElement('div');
      arrows.className = 'thumb-arrows';
      arrows.style.display = 'none';

      const leftBtn = document.createElement('button');
      leftBtn.className = 'thumb-arrow thumb-arrow-left';
      leftBtn.dataset.direction = 'prev';
      leftBtn.type = 'button';
      leftBtn.textContent = '‹';

      const rightBtn = document.createElement('button');
      rightBtn.className = 'thumb-arrow thumb-arrow-right';
      rightBtn.dataset.direction = 'next';
      rightBtn.type = 'button';
      rightBtn.textContent = '›';

      arrows.appendChild(leftBtn);
      arrows.appendChild(rightBtn);
      thumbLink.appendChild(arrows);

      const addBtn = document.createElement('button');
      addBtn.className = 'add-to-cart-btn';
      addBtn.dataset.pid = String(pid);
      addBtn.type = 'button';
      addBtn.textContent = 'Add to Cart';

      const name = document.createElement('h3');
      name.className = 'product-name';
      const nameLink = document.createElement('a');
      nameLink.href = `product.html?pid=${encodeURIComponent(pid)}`;
      nameLink.textContent = String(p.name || '');
      name.appendChild(nameLink);

      const price = document.createElement('p');
      price.className = 'product-price';
      price.textContent = `$${Number(p.price).toFixed(2)}`;

      article.appendChild(thumbLink);
      article.appendChild(addBtn);
      article.appendChild(name);
      article.appendChild(price);
      grid.appendChild(article);
    });

    // After rendering, bind hover and arrow events for thumbnails
    initThumbnailHoverAndArrows();
  } catch (e) {
    console.error('Failed to load product list:', e);
    grid.textContent = 'Failed to load products, please try again later.';
    grid.style.color = 'red';
  }
});

// Load categories from /api/categories and render into the Categories section.
async function loadCategoriesForHome() {
  try {
    const categories = (await window.loadCategoriesIntoNav?.()) || [];
    const params = new URLSearchParams(window.location.search);
    const currentCat = params.get('catid');

    // Update breadcrumb: home > current category (or All)
    const sectionEl = document.querySelector('.breadcrumb-section');
    if (sectionEl) {
      if (!currentCat) {
        sectionEl.textContent = 'All';
      } else {
        const current = categories.find(c => String(c.catid) === String(currentCat));
        sectionEl.textContent = current ? current.name : 'Category';
      }
    }
  } catch (e) {
    console.error('Failed to load categories for home page:', e);
  }
}

/* Initialize hover behavior and arrow click handlers
 * for product thumbnails on the home page.
 */
function initThumbnailHoverAndArrows() {
  const thumbnails = document.querySelectorAll('.product-thumbnail');

  thumbnails.forEach(thumb => {
    const pid = thumb.dataset.pid;
    const imgEl = thumb.querySelector('.product-thumb-img');
    const arrows = thumb.querySelector('.thumb-arrows');
    if (!pid || !imgEl || !arrows) return;

    thumb.dataset.currentIndex = '0';

    thumb.addEventListener('mouseenter', () => {
      arrows.style.display = 'flex';
    });

    thumb.addEventListener('mouseleave', () => {
      arrows.style.display = 'none';
    });

    arrows.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.target.closest('.thumb-arrow');
      if (!btn) return;

      const direction = btn.dataset.direction;
      const images = await ensureProductImagesLoaded(pid);
      if (!images || images.length === 0) return;

      let index = parseInt(thumb.dataset.currentIndex || '0', 10);
      if (direction === 'next') {
        index = (index + 1) % images.length;
      } else if (direction === 'prev') {
        index = (index - 1 + images.length) % images.length;
      }

      thumb.dataset.currentIndex = String(index);
      imgEl.src = images[index];
    });
  });
}


async function ensureProductImagesLoaded(pid) {
  if (productImagesCache[pid]) {
    return productImagesCache[pid];
  }

  try {
    const res = await fetch(`${API_BASE}/products/${pid}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = await res.json();

    const images = Array.isArray(p.images) ? p.images : [];
    let urls = images
      .map(img => safeImagePath(img.thumbnail_path || img.image_path))
      .filter(Boolean);

    // Fallback to single thumbnail/cover if multi-image list is empty
    if (urls.length === 0) {
      const single = safeImagePath(p.thumbnail_path || p.image_path || '');
      if (single) urls = [single];
    }

    productImagesCache[pid] = urls;
    return urls;
  } catch (e) {
    console.error(`Failed to load images for product ${pid}:`, e);
    productImagesCache[pid] = [];
    return [];
  }
}