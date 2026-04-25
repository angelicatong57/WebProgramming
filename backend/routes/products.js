const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const upload = require('../middleware/upload');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { body, param, query, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');

// Safely delete a file on disk, ignoring "busy/locked" errors on Windows
function safeUnlink(absPath) {
    try {
        if (fs.existsSync(absPath)) {
            fs.unlinkSync(absPath);
        }
    } catch (err) {
        // On Windows, files can be temporarily locked (EBUSY). Log and continue.
        if (err && err.code === 'EBUSY') {
            console.warn('File is busy/locked, skip deleting:', absPath);
        } else {
            console.warn('Failed to delete file:', absPath, err.message);
        }
    }
}

// ==================== Get all products ====================
router.get('/', [
    query('catid').optional().isInt().withMessage('catid must be an integer')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { catid } = req.query;
        let sql = 'SELECT * FROM products';
        const params = [];
        
        if (catid) {
            sql += ' WHERE catid = ?';
            params.push(catid);
        }
        
        sql += ' ORDER BY pid DESC';
        
        const products = await db.allAsync(sql, params);
        res.json(products);
        
    } catch (err) {
        console.error('Failed to get product list:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== Get single product (with images and category name) ====================
router.get('/:pid', [
    param('pid').isInt().withMessage('pid must be an integer')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { pid } = req.params;
        const product = await db.getAsync(
            `SELECT p.*, c.name AS category_name
             FROM products p
             LEFT JOIN categories c ON p.catid = c.catid
             WHERE p.pid = ?`,
            [pid]
        );
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Fetch all images for this product, ordered by sort_order
        const images = await db.allAsync(
            'SELECT image_path, thumbnail_path, sort_order FROM product_images WHERE pid = ? ORDER BY sort_order ASC',
            [pid]
        );
        
        res.json({
            ...product,
            images
        });
        
    } catch (err) {
        console.error('Failed to get product:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== Create product ====================
// Supports multiple images, field name is "images"
router.post('/', requireAdmin, upload.array('images', 10), [
    body('catid').isInt().withMessage('Please choose a valid category'),
    body('name').trim().notEmpty().withMessage('Product name cannot be empty')
               .isLength({ max: 100 }).withMessage('Product name cannot exceed 100 characters'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('storage').isInt({ min: 0 }).withMessage('Storage must be a non-negative integer'),
    // Do not HTML-escape description, store raw text
    body('description').optional().trim()
], async (req, res) => {

    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { catid, name, price, storage, description } = req.body;
     // Debug storage value after validation
     console.log('req.body.storage (after validation):', req.body.storage);
    
    try {
        // 1. Insert basic product info
        const result = await db.runAsync(
            'INSERT INTO products (catid, name, price, storage, description) VALUES (?, ?, ?, ?, ?)',
            [catid, name, price, storage, description]
        );
        
        const pid = result.lastID;
        
        // 2. If images uploaded, process multiple images
        if (req.files && req.files.length > 0) {
            for (let index = 0; index < req.files.length; index++) {
                const file = req.files[index];
                const ext = path.extname(file.originalname);
                const originalFilename = `${pid}_${index + 1}${ext}`;
                const thumbnailFilename = `${pid}_${index + 1}_thumb${ext}`;
                
                const originalPath = path.join('uploads/originals', originalFilename);
                const thumbnailPath = path.join('uploads/thumbnails', thumbnailFilename);
                
                // Rename temp file
                fs.renameSync(file.path, originalPath);
                
                // Generate thumbnail (300x300)
                await sharp(originalPath)
                    .resize(300, 300, { 
                        fit: 'cover',
                        withoutEnlargement: true 
                    })
                    .toFile(thumbnailPath);
                
                const imagePath = `/uploads/originals/${originalFilename}`;
                const thumbPath = `/uploads/thumbnails/${thumbnailFilename}`;

                // Insert into product_images:
                // 1) Use (pid, image_path, thumbnail_path, sort_order) as preferred schema
                // 2) If legacy schema with NOT NULL product_id exists, fall back to inserting product_id too
                try {
                    await db.runAsync(
                        'INSERT INTO product_images (pid, image_path, thumbnail_path, sort_order) VALUES (?, ?, ?, ?)',
                        [pid, imagePath, thumbPath, index]
                    );
                } catch (err) {
                    if (err && err.message && err.message.includes('product_images.product_id')) {
                        await db.runAsync(
                            'INSERT INTO product_images (pid, image_path, thumbnail_path, sort_order, product_id) VALUES (?, ?, ?, ?, ?)',
                            [pid, imagePath, thumbPath, index, pid]
                        );
                    } else {
                        throw err;
                    }
                }

                // First image is also stored on products table as cover, for backward compatibility
                if (index === 0) {
                    await db.runAsync(
                        'UPDATE products SET image_path = ?, thumbnail_path = ? WHERE pid = ?',
                        [imagePath, thumbPath, pid]
                    );
                }
            }
        }
        
        res.status(201).json({ 
            message: 'Product created successfully', 
            pid: pid 
        });
        
    } catch (err) {
        console.error('Failed to create product:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== Update product ====================
// Also supports multiple images with field name "images"
router.put('/:pid', requireAdmin, upload.array('images', 10), [
    param('pid').isInt().withMessage('pid must be an integer'),
    body('catid').optional().isInt(),
    body('name').optional().trim().isLength({ max: 100 }),
    body('price').optional().isFloat({ min: 0 }),
    body('storage').optional().isInt({ min: 0 }),
    // Do not HTML-escape description on update either
    body('description').optional().trim()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { pid } = req.params;
    const updates = [];
    const values = [];
    
    // Dynamically build update statement
    if (req.body.catid !== undefined) {
        updates.push('catid = ?');
        values.push(req.body.catid);
    }
    if (req.body.name !== undefined) {
        updates.push('name = ?');
        values.push(req.body.name);
    }
    if (req.body.price !== undefined) {
        updates.push('price = ?');
        values.push(req.body.price);
    }
    if (req.body.storage !== undefined) {
        updates.push('storage = ?');
        values.push(req.body.storage);
    }
    if (req.body.description !== undefined) {
        updates.push('description = ?');
        values.push(req.body.description);
    }
    
    try {
        // If new images uploaded, replace all existing images for this product
        if (req.files && req.files.length > 0) {
            // First query all old image paths (cover + extra images)
            const oldCover = await db.getAsync(
                'SELECT image_path, thumbnail_path FROM products WHERE pid = ?',
                [pid]
            );
            const oldImages = await db.allAsync(
                'SELECT image_path, thumbnail_path FROM product_images WHERE pid = ?',
                [pid]
            );

            // Delete old image files
            const toDelete = [];
            if (oldCover && oldCover.image_path) {
                toDelete.push(oldCover.image_path, oldCover.thumbnail_path);
            }
            if (oldImages && oldImages.length) {
                oldImages.forEach(img => {
                    if (img.image_path) toDelete.push(img.image_path);
                    if (img.thumbnail_path) toDelete.push(img.thumbnail_path);
                });
            }
            toDelete.forEach(p => {
                if (!p) return;
                const abs = path.join(__dirname, '../../', p);
                safeUnlink(abs);
            });

            // Delete old image records in product_images
            await db.runAsync('DELETE FROM product_images WHERE pid = ?', [pid]);

            // Save new images
            for (let index = 0; index < req.files.length; index++) {
                const file = req.files[index];
                const ext = path.extname(file.originalname);
                const originalFilename = `${pid}_${index + 1}${ext}`;
                const thumbnailFilename = `${pid}_${index + 1}_thumb${ext}`;

                const originalPath = path.join('uploads/originals', originalFilename);
                const thumbnailPath = path.join('uploads/thumbnails', thumbnailFilename);

                fs.renameSync(file.path, originalPath);

                await sharp(originalPath)
                    .resize(300, 300, { fit: 'cover' })
                    .toFile(thumbnailPath);

                const imagePath = `/uploads/originals/${originalFilename}`;
                const thumbPath = `/uploads/thumbnails/${thumbnailFilename}`;

                // Same compatibility with legacy NOT NULL product_id column
                try {
                    await db.runAsync(
                        'INSERT INTO product_images (pid, image_path, thumbnail_path, sort_order) VALUES (?, ?, ?, ?)',
                        [pid, imagePath, thumbPath, index]
                    );
                } catch (err) {
                    if (err && err.message && err.message.includes('product_images.product_id')) {
                        await db.runAsync(
                            'INSERT INTO product_images (pid, image_path, thumbnail_path, sort_order, product_id) VALUES (?, ?, ?, ?, ?)',
                            [pid, imagePath, thumbPath, index, pid]
                        );
                    } else {
                        throw err;
                    }
                }

                if (index === 0) {
                    updates.push('image_path = ?');
                    values.push(imagePath);
                    updates.push('thumbnail_path = ?');
                    values.push(thumbPath);
                }
            }
        }
        
        // If there is nothing to update
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No update data provided' });
        }
        
        // Execute update
        values.push(pid);
        await db.runAsync(
            `UPDATE products SET ${updates.join(', ')} WHERE pid = ?`,
            values
        );
        
        res.json({ message: 'Product updated successfully' });
        
    } catch (err) {
        console.error('Failed to update product:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== Delete product ====================
router.delete('/:pid', requireAdmin, [
    param('pid').isInt().withMessage('pid must be an integer')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { pid } = req.params;
    
    try {
        // First get product info to find cover image paths
        const product = await db.getAsync('SELECT image_path, thumbnail_path FROM products WHERE pid = ?', [pid]);
        // And all image records
        const images = await db.allAsync('SELECT image_path, thumbnail_path FROM product_images WHERE pid = ?', [pid]);
        
        const pathsToDelete = [];
        if (product) {
            if (product.image_path) pathsToDelete.push(product.image_path);
            if (product.thumbnail_path) pathsToDelete.push(product.thumbnail_path);
        }
        if (images && images.length) {
            images.forEach(img => {
                if (img.image_path) pathsToDelete.push(img.image_path);
                if (img.thumbnail_path) pathsToDelete.push(img.thumbnail_path);
            });
        }

        pathsToDelete.forEach(p => {
            const abs = path.join(__dirname, '../../', p);
            safeUnlink(abs);
        });
        
        // Delete DB records
        const result = await db.runAsync('DELETE FROM products WHERE pid = ?', [pid]);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        res.json({ message: 'Product deleted successfully' });
        
    } catch (err) {
        console.error('Failed to delete product:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;