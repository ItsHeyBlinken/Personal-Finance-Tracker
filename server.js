const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize the database
const db = new sqlite3.Database('./finance_tracker.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the database.');
  }
});

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Add security headers
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  );
  next();
});

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to add an expense
app.post('/api/expenses', (req, res) => {
  const { description, expenseCategory, amount, category, payPeriod } = req.body;
  db.run(`INSERT INTO expenses (description, expenseCategory, amount, category, payPeriod) VALUES (?, ?, ?, ?, ?)`,
    [description, expenseCategory, amount, category, payPeriod], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID });
    });
});

// Route to get all expenses
app.get('/api/expenses', (req, res) => {
  db.all(`SELECT * FROM expenses`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Route to get balances
app.get('/api/balances', (req, res) => {
  const queries = [
    { table: 'bills', account: 'Bills' },
    { table: 'gas_money', account: 'Gas Fund' },
    { table: 'emergency_fund', account: 'Emergency Fund' },
    { table: 'daughter_account', account: "Daughter's Account" },
    { table: 'planned', account: 'Planned' }
  ];

  const promises = queries.map(query => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT SUM(amount) as total FROM ${query.table}`, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve({ account: query.account, total: row.total || 0 });
        }
      });
    });
  });

  Promise.all(promises)
    .then(results => res.json(results))
    .catch(err => res.status(500).json({ error: err.message }));
});

// Add similar routes for planned transactions, payrolls, balances, etc.

// Start the server
function start() {
  return new Promise((resolve, reject) => {
    try {
      app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { start };

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});
