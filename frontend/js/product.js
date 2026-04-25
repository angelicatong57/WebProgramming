// frontend/js/product.js
const API_BASE = '/api';

function getPidFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('pid');
}

// Decode HTML entities like &quot; &#x27; etc. into normal characters
function decodeHtmlEntities(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

// Fetch category name by id (used as fallback when backend doesn't join category_name)
async function fetchCategoryName(catid) {
  if (!catid) return null;
  try {
    const res = await fetch(`${API_BASE}/categories/${encodeURIComponent(catid)}`);
    if (!res.ok) return null;
    const cat = await res.json();
    return cat && cat.name ? cat.name : null;
  } catch (e) {
    console.error('Failed to load category for breadcrumb:', e);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const pid = getPidFromQuery();
  if (!pid) {
    console.error('Missing pid parameter');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/products/${pid}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = await res.json();

    // Top nav: render categories and highlight this product's category
    if (window.loadCategoriesIntoNav) {
      await window.loadCategoriesIntoNav({ activeCatid: p.catid });
    }

    // Title, price, description
    document.querySelector('.product-info__name').textContent = p.name;
    document.querySelector('.product-info__price').textContent =
      `$${Number(p.price).toFixed(2)}`;
    const descEl = document.querySelector('.product-info__desc');
    if (descEl) {
      const rawDesc = p.description || 'No description.';
      descEl.textContent = decodeHtmlEntities(rawDesc);
    }

    // Breadcrumb: home > category name > product name
    let catName = p.category_name || null;
    const catLinkEl = document.querySelector('.breadcrumb-category-link');
    const catNameEl = document.querySelector('.breadcrumb-category-name');
    const productCrumbEl = document.querySelector('.product-breadcrumb-name');

    // If backend didn't provide category_name, fetch it explicitly
    if (!catName && p.catid) {
      catName = await fetchCategoryName(p.catid);
    }

    if (catNameEl) {
      catNameEl.textContent = catName || 'Category';
    }
    if (catLinkEl && p.catid) {
      catLinkEl.href = `home.html?catid=${encodeURIComponent(p.catid)}`;
    }
    if (productCrumbEl) {
      productCrumbEl.textContent = p.name;
    }

    // Add to cart (product page)
    const addBtn = document.querySelector('.add-to-cart-btn');
    const qtyInput = document.querySelector('.quantity-input');
    if (addBtn && window.cart) {
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const qty = qtyInput ? Math.max(1, Number.parseInt(qtyInput.value || '1', 10)) : 1;
        window.cart.add(pid, Number.isFinite(qty) ? qty : 1);
      });
    }

    // Build carousel: prefer multi-images, fallback to single image_path
    const wrapper = document.querySelector('.swiper .swiper-wrapper');
    if (wrapper) {
      const images = Array.isArray(p.images) ? p.images : [];
      const newSlides = [];

      if (images.length > 0) {
        images.forEach((img) => {
          const src = safeImagePath(img.image_path || img.thumbnail_path);
          if (!src) return;
          const slide = document.createElement('div');
          slide.className = 'swiper-slide';
          const image = document.createElement('img');
          image.src = src;
          image.alt = String(p.name || '');
          slide.appendChild(image);
          newSlides.push(slide);
        });
      } else if (p.image_path) {
        const src = safeImagePath(p.image_path);
        if (src) {
          const slide = document.createElement('div');
          slide.className = 'swiper-slide';
          const image = document.createElement('img');
          image.src = src;
          image.alt = String(p.name || '');
          slide.appendChild(image);
          newSlides.push(slide);
        }
      }

      if (newSlides.length > 0) {
        wrapper.replaceChildren(...newSlides);
        if (window.productSwiper) {
          window.productSwiper.updateSlides();
          window.productSwiper.update();
          window.productSwiper.slideTo(0);
        }
      }
    }
  } catch (e) {
    console.error('Failed to load product detail:', e);
  }
});