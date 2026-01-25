const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gallery.db');

let db = null;

function getDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeFaqTable();
  }
  return db;
}

function initializeFaqTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS faq_items (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      display_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT
    )
  `;

  db.exec(createTableSQL);
}

// Get all FAQ items (sorted by display_order and category)
function getAllFaqItems() {
  const db = getDatabase();
  const items = db.prepare(`
    SELECT id, question, answer, category, display_order, created_at, updated_at
    FROM faq_items
    ORDER BY category ASC, display_order ASC, created_at ASC
  `).all();

  return items;
}

// Get FAQ item by ID
function getFaqItemById(id) {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, question, answer, category, display_order, created_at, updated_at
    FROM faq_items
    WHERE id = ?
  `).get(id);
}

// Create new FAQ item
function createFaqItem(question, answer, category = null, displayOrder = 0, createdBy = 'system') {
  const db = getDatabase();

  if (!question || question.trim().length === 0) {
    throw new Error('Frage darf nicht leer sein');
  }

  if (!answer || answer.trim().length === 0) {
    throw new Error('Antwort darf nicht leer sein');
  }

  const id = generateId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO faq_items (id, question, answer, category, display_order, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, question.trim(), answer.trim(), category, displayOrder, now, now, createdBy, createdBy);

  return getFaqItemById(id);
}

// Update FAQ item
function updateFaqItem(id, updates, updatedBy) {
  const db = getDatabase();

  const currentItem = getFaqItemById(id);
  if (!currentItem) {
    throw new Error('FAQ-Eintrag nicht gefunden');
  }

  const allowedFields = ['question', 'answer', 'category', 'display_order'];
  const updateFields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(snakeKey)) {
      updateFields.push(`${snakeKey} = ?`);
      values.push(value);
    }
  }

  if (updateFields.length === 0) {
    throw new Error('Keine gültigen Felder zum Aktualisieren');
  }

  // Add updated_at and updated_by
  updateFields.push('updated_at = ?');
  updateFields.push('updated_by = ?');
  values.push(new Date().toISOString());
  values.push(updatedBy);
  values.push(id);

  const query = `UPDATE faq_items SET ${updateFields.join(', ')} WHERE id = ?`;
  db.prepare(query).run(...values);

  return getFaqItemById(id);
}

// Delete FAQ item
function deleteFaqItem(id, deletedBy) {
  const db = getDatabase();

  const item = getFaqItemById(id);
  if (!item) {
    throw new Error('FAQ-Eintrag nicht gefunden');
  }

  db.prepare('DELETE FROM faq_items WHERE id = ?').run(id);

  return { success: true };
}

// Helper function to generate unique ID
function generateId() {
  return 'faq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

module.exports = {
  getAllFaqItems,
  getFaqItemById,
  createFaqItem,
  updateFaqItem,
  deleteFaqItem
};
