const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { body, param, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');

// ==================== Get all categories ====================
router.get('/', async (req, res) => {
    try {
        const categories = await db.allAsync('SELECT * FROM categories ORDER BY catid');
        res.json(categories);
    } catch (err) {
        console.error('Failed to get categories:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== Get single category ====================
router.get('/:catid', [
    param('catid').isInt().withMessage('catid must be an integer')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { catid } = req.params;
        const category = await db.getAsync('SELECT * FROM categories WHERE catid = ?', [catid]);
        
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.json(category);
    } catch (err) {
        console.error('Failed to get category:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== Create category ====================
router.post('/', requireAdmin, [
    body('name').trim().notEmpty().withMessage('Category name cannot be empty')
               .isLength({ max: 50 }).withMessage('Category name cannot exceed 50 characters')
], async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { name } = req.body;
    
    try {
        // Check if category name already exists
        const existing = await db.getAsync('SELECT * FROM categories WHERE name = ?', [name]);
        if (existing) {
            return res.status(400).json({ error: 'Category name already exists' });
        }
        
        const result = await db.runAsync(
            'INSERT INTO categories (name) VALUES (?)',
            [name]
        );
        
        res.status(201).json({ 
            message: 'Category created successfully', 
            catid: result.lastID,
            name: name 
        });
        
    } catch (err) {
        console.error('Failed to create category:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== Update category ====================
router.put('/:catid', requireAdmin, [
    param('catid').isInt().withMessage('catid must be an integer'),
    body('name').trim().notEmpty().withMessage('Category name cannot be empty')
               .isLength({ max: 50 }).withMessage('Category name cannot exceed 50 characters')
], async (req, res) => {
    const { catid } = req.params;
    const { name } = req.body;
    
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    try {
        // Check if there is another category with the same name (excluding self)
        const existing = await db.getAsync(
            'SELECT * FROM categories WHERE name = ? AND catid != ?', 
            [name, catid]
        );
        if (existing) {
            return res.status(400).json({ error: 'Category name already exists' });
        }
        
        const result = await db.runAsync(
            'UPDATE categories SET name = ? WHERE catid = ?',
            [name, catid]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.json({ message: 'Category updated successfully' });
        
    } catch (err) {
        console.error('Failed to update category:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== Delete category ====================
router.delete('/:catid', requireAdmin, [
    param('catid').isInt().withMessage('catid must be an integer')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { catid } = req.params;
    
    try {
        // First check whether there are products in this category
        const products = await db.getAsync(
            'SELECT COUNT(*) as count FROM products WHERE catid = ?', 
            [catid]
        );
        
        if (products.count > 0) {
            return res.status(400).json({ 
                error: `This category has ${products.count} products and cannot be deleted` 
            });
        }
        
        const result = await db.runAsync('DELETE FROM categories WHERE catid = ?', [catid]);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.json({ message: 'Category deleted successfully' });
        
    } catch (err) {
        console.error('Failed to delete category:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;