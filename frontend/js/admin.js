// ==================== Global state ====================
const API_BASE = '/api';  // API base path
let currentTab = 'products';
let editingProductId = null;
let editingCategoryId = null;
let allProducts = [];  // Cached product list for filtering
let categoryMap = {};  // catid -> category name mapping for product list

// ==================== Page init ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Admin panel initializing...');
    verifyAdminAndInit();
    
    // Bind tab switch
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
    
    // Bind form submit
    document.getElementById('productForm').addEventListener('submit', handleProductSubmit);
    document.getElementById('categoryForm').addEventListener('submit', handleCategorySubmit);
    
    // Bind cancel edit buttons
    document.getElementById('cancelProductEdit').addEventListener('click', resetProductForm);
    document.getElementById('cancelCategoryEdit').addEventListener('click', resetCategoryForm);
    
    // Bind search & filter
    document.getElementById('productSearch').addEventListener('keyup', filterProducts);
    document.getElementById('productFilter').addEventListener('change', filterProducts);
    document.getElementById('categorySearch').addEventListener('keyup', filterCategories);
    
    // Bind file upload preview (multi-images)
    document.getElementById('productImages').addEventListener('change', previewImage);
    
    // Bind remove image button
    const removeBtn = document.querySelector('.remove-image');
    if (removeBtn) {
        removeBtn.addEventListener('click', removeImage);
    }
    
    // Bind file upload wrapper click
    const fileWrapper = document.querySelector('.file-input-wrapper');
    if (fileWrapper) {
        fileWrapper.addEventListener('click', function() {
            document.getElementById('productImages').click();
        });
    }
});

async function verifyAdminAndInit() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (!response.ok || !data.authenticated || !data.user || data.user.is_admin !== 1) {
            window.location.href = '/login.html';
            return;
        }
        loadCategories();
        loadProducts();
    } catch (error) {
        window.location.href = '/login.html';
    }
}


// ==================== Tab switching ====================
function switchTab(tabId) {
    console.log(`Switching to tab: ${tabId}`);
    
    currentTab = tabId;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabId}-tab`).classList.add('active');
}


// ==================== Product-related ====================

// Load categories (dropdowns and mapping)
async function loadCategories() {
    try {
        console.log('Loading categories...');
        const response = await fetch(`${API_BASE}/categories`);
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const categories = await response.json();
        console.log(`Loaded ${categories.length} categories`);
        
        const catSelect = document.getElementById('productCatid');
        const filterSelect = document.getElementById('productFilter');
        
        if (!catSelect || !filterSelect) {
            console.error('Category select element not found');
            return;
        }
        
        catSelect.innerHTML = '<option value="">-- Select a category --</option>';
        filterSelect.innerHTML = '<option value="all">All categories</option>';
        categoryMap = {};
        
        categories.forEach(cat => {
            // Form select
            const option = document.createElement('option');
            option.value = cat.catid;
            option.textContent = cat.name;
            catSelect.appendChild(option);
            
            // Filter select
            const filterOption = document.createElement('option');
            filterOption.value = cat.catid;
            filterOption.textContent = cat.name;
            filterSelect.appendChild(filterOption);

            categoryMap[cat.catid] = cat.name;
        });
        
        // Also render category list
        displayCategories(categories);
        
    } catch (error) {
        console.error('Failed to load categories:', error);
        showAlert('Failed to load categories: ' + error.message, 'error');
    }
}

// Load products list
async function loadProducts() {
    try {
        console.log('Loading products...');
        const response = await fetch(`${API_BASE}/products`);
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const products = await response.json();
        console.log(`Loaded ${products.length} products`);
        
        // Cache for filtering
        allProducts = products;
        displayProducts(products);
        
    } catch (error) {
        console.error('Failed to load products:', error);
        showAlert('Failed to load products: ' + error.message, 'error');
        
        const container = document.getElementById('productList');
        if (container) {
            container.innerHTML = '<div class="empty-state">❌ Failed to load, please refresh</div>';
        }
    }
}

// Render product list
function displayProducts(products) {
    const container = document.getElementById('productList');
    
    if (!container) {
        console.error('productList container not found');
        return;
    }
    
    if (!products || products.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 No products yet</div>';
        return;
    }
    
    let html = '';
    products.forEach(p => {
        const catName = categoryMap[p.catid] || `ID: ${p.catid}`;
        html += `
            <div class="item-card" data-product-id="${p.pid}">
                <div class="item-info">
                    <div class="item-title">${escapeHtml(p.name)}</div>
                    <div class="item-meta">
                        <span>Category: ${escapeHtml(catName)}</span>
                        <span class="item-price"> $ ${Number(p.price).toFixed(2)}</span>
                        ${p.image_path ? '<span>🖼️ With image</span>' : ''}
                    </div>
                    <div class="item-description">${escapeHtml(p.description || 'No description')}</div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon btn-edit" onclick="editProduct(${p.pid})">Edit</button>
                    <button class="btn-icon btn-delete" onclick="deleteProduct(${p.pid})">Delete</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html; 
}

// Filter products
function filterProducts() {
    if (!allProducts || allProducts.length === 0) return;
    
    const searchTerm = document.getElementById('productSearch').value.toLowerCase();
    const catFilter = document.getElementById('productFilter').value;
    
    console.log(`Filter products: search="${searchTerm}", category=${catFilter}`);
    
    const filtered = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm) || 
                             (p.description && p.description.toLowerCase().includes(searchTerm));
        const matchesCat = catFilter === 'all' || p.catid == catFilter;
        return matchesSearch && matchesCat;
    });
    
    displayProducts(filtered);
}

// Handle product form submit
async function handleProductSubmit(event) {
    event.preventDefault();
    
    if (!validateProductForm()) {
        return;
    }
    
    // Show loading state
    const submitBtn = document.getElementById('productSubmitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';
    submitBtn.disabled = true;
    
    const formData = new FormData();
    
    formData.append('catid', document.getElementById('productCatid').value);
    formData.append('name', document.getElementById('productName').value);
    formData.append('price', document.getElementById('productPrice').value);
    formData.append('storage', document.getElementById('productStorage').value);
    formData.append('description', document.getElementById('productDescription').value);

    // Multi-image upload: append all selected files to FormData
    const imageInput = document.getElementById('productImages');
    if (imageInput && imageInput.files && imageInput.files.length > 0) {
        Array.from(imageInput.files).forEach(file => {
            formData.append('images', file);
        });
    }
    
    try {
        let url = `${API_BASE}/products`;
        let method = 'POST';
        
        if (editingProductId) {
            url = `${API_BASE}/products/${editingProductId}`;
            method = 'PUT';
        }
        
        console.log(`${method} ${url}`);
        
        const response = await window.csrfFetch(url, {
            method: method,
            body: formData
        });
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }
        

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || result.message || 'Operation failed');
        }
        
        showAlert(editingProductId ? 'Product updated!' : 'Product added!', 'success');
        
        resetProductForm();
        await loadProducts(); // reload list
        
    } catch (error) {
        console.error('Operation failed:', error);
        showAlert('Operation failed: ' + error.message, 'error');
    } finally {
        // Restore button
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Edit product
async function editProduct(pid) {
    try {
        console.log(`Edit product: ${pid}`);
        
        const response = await fetch(`${API_BASE}/products/${pid}`);
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Failed to fetch product info');
        }
        
        const product = await response.json();
        
        document.getElementById('productId').value = product.pid;
        document.getElementById('productCatid').value = product.catid;
        document.getElementById('productName').value = product.name;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productStorage').value = product.storage ?? 0;
        document.getElementById('productDescription').value = product.description || '';

        
        // If has image, show preview
        const previewSrc = safeImagePath(product.image_path || '');
        if (previewSrc) {
            const previewDiv = document.getElementById('productImagePreview');
            const previewImg = document.getElementById('previewImg');
            previewImg.src = previewSrc;
            previewDiv.style.display = 'inline-block';
        }
        
        editingProductId = product.pid;
        document.getElementById('productFormTitle').textContent = 'Edit Product';
        document.getElementById('productSubmitBtn').textContent = 'Update Product';
        document.getElementById('cancelProductEdit').style.display = 'inline-block';
        
        // Switch to products tab
        if (currentTab !== 'products') {
            switchTab('products');
        }
        
        document.querySelector('#products-tab .form-section').scrollIntoView({ 
            behavior: 'smooth' 
        });
        
    } catch (error) {
        console.error('Failed to load product info:', error);
        showAlert('Failed to load product info: ' + error.message, 'error');
    }
}

// Delete product
async function deleteProduct(pid) {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
        return;
    }
    
    try {
        console.log(`Delete product: ${pid}`);
        
        const response = await window.csrfFetch(`${API_BASE}/products/${pid}`, {
            method: 'DELETE'
        });
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Delete failed');
        }
        
        showAlert('Product deleted!', 'success');
        
        await loadProducts();
        
        if (editingProductId === pid) {
            resetProductForm();
        }
        
    } catch (error) {
        console.error('Delete failed:', error);
        showAlert('Delete failed: ' + error.message, 'error');
    }
}

// Validate product form
function validateProductForm() {
    const catid = document.getElementById('productCatid').value;
    const name = document.getElementById('productName').value.trim();
    const price = document.getElementById('productPrice').value;
    let storage = document.getElementById('productStorage').value;
    
    if (!catid) {
        showAlert('Please select a product category', 'error');
        return false;
    }
    
    if (!name) {
        showAlert('Please enter a product name', 'error');
        return false;
    }
    
    if (name.length > 100) {
        showAlert('Product name cannot exceed 100 characters', 'error');
        return false;
    }
    
    if (!price || price <= 0) {
        showAlert('Please enter a valid price', 'error');
        return false;
    }

    // If stock empty, treat as 0
    if (storage === '' || storage === null || storage === undefined) {
        storage = '0';
        document.getElementById('productStorage').value = '0';
    }
    const storageNum = Number(storage);
    if (!Number.isInteger(storageNum) || storageNum < 0) {
        showAlert('Stock quantity must be a non-negative integer', 'error');
        return false;
    }
    
    // Validate image size (each)
    const imageInput = document.getElementById('productImages');
    if (imageInput && imageInput.files && imageInput.files.length > 0) {
        for (const file of imageInput.files) {
            if (file.size > 10 * 1024 * 1024) {
                showAlert('Each image must be smaller than 10MB', 'error');
                return false;
            }
        }
    }
    
    return true;
}

// Reset product form
function resetProductForm() {
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productImagePreview').style.display = 'none';
    document.getElementById('previewImg').src = '';
    const additional = document.getElementById('additionalImages');
    if (additional) {
        additional.innerHTML = '';
    }
    
    editingProductId = null;
    document.getElementById('productFormTitle').textContent = 'Add New Product';
    document.getElementById('productSubmitBtn').textContent = 'Add Product';
    document.getElementById('cancelProductEdit').style.display = 'none';
}

// ==================== Category-related ====================

// Render category list
function displayCategories(categories) {
    const container = document.getElementById('categoryList');
    
    if (!container) {
        console.error('categoryList container not found');
        return;
    }
    
    if (!categories || categories.length === 0) {
        container.innerHTML = '<div class="empty-state">No categories yet</div>';
        return;
    }
    
    // Get product counts per category
    getProductCounts().then(counts => {
        let html = '';
        categories.forEach(cat => {
            const count = counts[cat.catid] || 0;
            html += `
                <div class="item-card category-item" data-category-id="${cat.catid}">
                    <div class="item-info">
                        <div class="item-title">
                            ${escapeHtml(cat.name)}
                        </div>
                        <div class="item-meta">
                            <span class="product-count">${count} products</span>
                        </div>
                    </div>
                    <div class="item-actions">
                        <button class="btn-icon btn-edit" onclick="editCategory(${cat.catid}, '${escapeHtml(cat.name)}')">Edit</button>
                        <button class="btn-icon btn-delete" onclick="deleteCategory(${cat.catid}, ${count})">Delete</button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    });
}

// Get product counts per category
async function getProductCounts() {
    try {
        const response = await fetch(`${API_BASE}/products`);
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return {};
        }
        const products = await response.json();
        
        const counts = {};
        products.forEach(p => {
            counts[p.catid] = (counts[p.catid] || 0) + 1;
        });
        return counts;
    } catch (error) {
        console.error('Failed to get product counts:', error);
        return {};
    }
}

// Filter categories
function filterCategories() {
    const searchTerm = document.getElementById('categorySearch').value.toLowerCase();
    const items = document.querySelectorAll('#categoryList .item-card');
    
    items.forEach(item => {
        const title = item.querySelector('.item-title').textContent.toLowerCase();
        if (title.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Handle category form submit
async function handleCategorySubmit(event) {
    event.preventDefault();
    
    const name = document.getElementById('categoryName').value.trim();
    
    if (!name) {
        showAlert('Please enter a category name', 'error');
        return;
    }
    
    if (name.length > 50) {
        showAlert('Category name cannot exceed 50 characters', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('categorySubmitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';
    submitBtn.disabled = true;
    
    try {
        let url = `${API_BASE}/categories`;
        let method = 'POST';
        let body = { name };
        
        if (editingCategoryId) {
            url = `${API_BASE}/categories/${editingCategoryId}`;
            method = 'PUT';
            body = { ...body, catid: editingCategoryId };
        }
        
        console.log(`${method} ${url}`, body);
        
        const response = await window.csrfFetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || result.message || 'Operation failed');
        }
        
        showAlert(editingCategoryId ? '✅ Category updated!' : '✅ Category added!', 'success');
        
        resetCategoryForm();
        await loadCategories(); // reload
        
    } catch (error) {
        console.error('Operation failed:', error);
        showAlert('❌ Operation failed: ' + error.message, 'error');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Edit category
function editCategory(id, name) {
    console.log(`Edit category: ${id}, ${name}`);
    
    document.getElementById('categoryId').value = id;
    document.getElementById('categoryName').value = name;
    
    editingCategoryId = id;
    document.getElementById('categoryFormTitle').textContent = '✏️ Edit Category';
    document.getElementById('categorySubmitBtn').textContent = 'Update Category';
    document.getElementById('cancelCategoryEdit').style.display = 'inline-block';
    
    // Switch to categories tab
    if (currentTab !== 'categories') {
        switchTab('categories');
    }
}

// Delete category
async function deleteCategory(id, productCount) {
    let message = 'Are you sure you want to delete this category?';
    if (productCount > 0) {
        message = `This category has ${productCount} products. Deleting the category will also remove these products. Continue?`;
    }
    
    if (!confirm(message)) {
        return;
    }
    
    try {
        console.log(`Delete category: ${id}`);
        
        const response = await window.csrfFetch(`${API_BASE}/categories/${id}`, {
            method: 'DELETE'
        });
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login.html';
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Delete failed');
        }
        
        showAlert('Category deleted!', 'success');
        
        if (editingCategoryId === id) {
            resetCategoryForm();
        }
        
        await loadCategories(); // reload
        
    } catch (error) {
        console.error('Delete failed:', error);
        showAlert(' Delete failed: ' + error.message, 'error');
    }
}

// Reset category form
function resetCategoryForm() {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = '';
    
    editingCategoryId = null;
    document.getElementById('categoryFormTitle').textContent = '➕ Add New Category';
    document.getElementById('categorySubmitBtn').textContent = 'Add Category';
    document.getElementById('cancelCategoryEdit').style.display = 'none';
}



// Image preview
function previewImage(event) {
    const files = event.target.files;
    const previewDiv = document.getElementById('productImagePreview');
    const previewImg = document.getElementById('previewImg');
    const additional = document.getElementById('additionalImages');

    if (additional) {
        additional.innerHTML = '';
    }

    if (!files || files.length === 0) {
        previewDiv.style.display = 'none';
        previewImg.src = '';
        return;
    }

    // Validate file size
    for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
            showAlert('Each image must be smaller than 10MB', 'error');
            const input = document.getElementById('productImages');
            if (input) input.value = '';
            previewDiv.style.display = 'none';
            previewImg.src = '';
            if (additional) additional.innerHTML = '';
            return;
        }
    }

    // First image as main preview
    const firstFile = files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        previewImg.src = e.target.result;
        previewDiv.style.display = 'inline-block';
    };
    reader.readAsDataURL(firstFile);

    // Others as thumbnails
    if (additional && files.length > 1) {
        Array.from(files)
            .slice(1)
            .forEach(file => {
                const r = new FileReader();
                r.onload = function(ev) {
                    const img = document.createElement('img');
                    img.src = ev.target.result;
                    img.alt = 'Preview';
                    img.className = 'preview-thumb';
                    additional.appendChild(img);
                };
                r.readAsDataURL(file);
            });
    }
}

// Remove images
function removeImage() {
    const input = document.getElementById('productImages');
    if (input) {
        input.value = '';
    }
    document.getElementById('productImagePreview').style.display = 'none';
    document.getElementById('previewImg').src = '';
    const additional = document.getElementById('additionalImages');
    if (additional) {
        additional.innerHTML = '';
    }
}

// Show alert message
function showAlert(message, type) {
    const alert = document.getElementById('alert');
    if (!alert) return;
    
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.style.display = 'block';
    
    // Auto hide after 3 seconds
    setTimeout(() => {
        alert.style.display = 'none';
    }, 3000);
}

//Escape HTML (prevent XSS)
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")  
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Expose functions to window for inline HTML handlers
window.switchTab = switchTab;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.filterProducts = filterProducts;
window.filterCategories = filterCategories;
window.previewImage = previewImage;
window.removeImage = removeImage;