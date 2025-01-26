const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./finance_tracker.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the database.');
  }
});

db.serialize(() => {
  // Create accounts table
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    name TEXT PRIMARY KEY,
    balance REAL DEFAULT 0
  )`);

  // Create expenses table
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT,
    expenseCategory TEXT,
    amount REAL,
    category TEXT,
    payPeriod TEXT
  )`);

  // Create deposits table
  db.run(`CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT,
    category TEXT,
    amount REAL,
    account TEXT,
    date TEXT,
    FOREIGN KEY(account) REFERENCES accounts(name)
  )`);

  // Create balances table
  db.run(`CREATE TABLE IF NOT EXISTS balances (
    account TEXT PRIMARY KEY,
    amount REAL DEFAULT 0,
    FOREIGN KEY(account) REFERENCES accounts(name)
  )`);
});

module.exports = db;
