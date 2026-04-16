const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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

// Get vote counts (upvotes, downvotes) for a single FAQ item
function getVoteCounts(faqId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) as upvotes,
      SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) as downvotes
    FROM faq_votes
    WHERE faq_id = ?
  `).get(faqId);

  return {
    upvotes: row.upvotes || 0,
    downvotes: row.downvotes || 0
  };
}

// Get a user's current vote for a given FAQ item (1, -1, or 0 if none)
function getUserVote(faqId, userId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT vote FROM faq_votes WHERE faq_id = ? AND user_id = ?
  `).get(faqId, userId);

  return row ? row.vote : 0;
}

// Cast / update / remove a vote. vote must be 1, -1, or 0 (0 removes).
function castVote(faqId, userId, vote) {
  const db = getDatabase();

  if (![1, -1, 0].includes(vote)) {
    throw new Error('Stimme muss 1, -1 oder 0 sein');
  }

  // Ensure FAQ item exists
  const item = db.prepare('SELECT id FROM faq_items WHERE id = ?').get(faqId);
  if (!item) {
    throw new Error('FAQ-Eintrag nicht gefunden');
  }

  if (vote === 0) {
    db.prepare('DELETE FROM faq_votes WHERE faq_id = ? AND user_id = ?').run(faqId, userId);
  } else {
    // Upsert: insert or replace the user's vote
    const existing = db.prepare('SELECT id FROM faq_votes WHERE faq_id = ? AND user_id = ?').get(faqId, userId);
    const now = new Date().toISOString();

    if (existing) {
      db.prepare('UPDATE faq_votes SET vote = ?, created_at = ? WHERE id = ?')
        .run(vote, now, existing.id);
    } else {
      db.prepare(`
        INSERT INTO faq_votes (id, faq_id, user_id, vote, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), faqId, userId, vote, now);
    }
  }

  const counts = getVoteCounts(faqId);
  return {
    upvotes: counts.upvotes,
    downvotes: counts.downvotes,
    userVote: vote
  };
}

// Get all FAQ items with vote info attached (upvotes, downvotes, userVote).
// If userId is null/undefined, userVote is always 0.
function getAllFaqItemsWithVotes(userId) {
  const db = getDatabase();
  const items = db.prepare(`
    SELECT id, question, answer, category, display_order, created_at, updated_at
    FROM faq_items
    ORDER BY category ASC, display_order ASC, created_at ASC
  `).all();

  // Aggregate all vote counts in one query for efficiency
  const voteAgg = db.prepare(`
    SELECT faq_id,
      SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) as upvotes,
      SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) as downvotes
    FROM faq_votes
    GROUP BY faq_id
  `).all();

  const voteMap = new Map();
  for (const row of voteAgg) {
    voteMap.set(row.faq_id, {
      upvotes: row.upvotes || 0,
      downvotes: row.downvotes || 0
    });
  }

  // Fetch this user's votes in one query
  const userVoteMap = new Map();
  if (userId) {
    const userVotes = db.prepare(`
      SELECT faq_id, vote FROM faq_votes WHERE user_id = ?
    `).all(userId);
    for (const row of userVotes) {
      userVoteMap.set(row.faq_id, row.vote);
    }
  }

  return items.map(item => {
    const counts = voteMap.get(item.id) || { upvotes: 0, downvotes: 0 };
    return {
      ...item,
      upvotes: counts.upvotes,
      downvotes: counts.downvotes,
      userVote: userVoteMap.get(item.id) || 0
    };
  });
}

// Count total FAQ items
function countFaqItems() {
  const db = getDatabase();
  return db.prepare('SELECT COUNT(*) as count FROM faq_items').get().count;
}

// Count distinct FAQ categories (excluding null)
function countFaqCategories() {
  const db = getDatabase();
  return db.prepare(`
    SELECT COUNT(DISTINCT category) as count
    FROM faq_items
    WHERE category IS NOT NULL AND category != ''
  `).get().count;
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
  getAllFaqItemsWithVotes,
  getFaqItemById,
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  getVoteCounts,
  getUserVote,
  castVote,
  countFaqItems,
  countFaqCategories
};
