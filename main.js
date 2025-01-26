const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadFile('public/index.html');
}

app.on('ready', () => {
  createWindow();

  // Ensure the database schema is set up
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        balance REAL NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        expenseCategory TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        payPeriod TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        account TEXT NOT NULL,
        date TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS balances (
        account TEXT PRIMARY KEY,
        amount REAL NOT NULL
      )
    `);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Database setup
const db = new sqlite3.Database('finance_tracker.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Database opened successfully');
  }
});

// IPC handlers
ipcMain.handle('load-balances', async () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT account, amount FROM balances', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
});

ipcMain.handle('load-expenses', async () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM expenses', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
});

ipcMain.handle('check-first-run', async () => {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM accounts", [], (err, row) => {
      if (err) reject(err);
      else resolve(row.count === 0);
    });
  });
});

ipcMain.handle('get-accounts', async () => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM accounts", [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle('add-account', async (event, { name, balance }) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO accounts (name, balance) VALUES (?, ?)",
      [name, balance],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            reject(new Error('An account with this name already exists'));
          } else {
            reject(err);
          }
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

ipcMain.handle('add-expense', async (event, expense) => {
  return new Promise((resolve, reject) => {
    const { description, expenseCategory, amount, category, payPeriod } = expense;
    
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // First insert the expense
      db.run(
        `INSERT INTO expenses (description, expenseCategory, amount, category, payPeriod) 
         VALUES (?, ?, ?, ?, ?)`,
        [description, expenseCategory, amount, category, payPeriod],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          // Then update the balance for the corresponding account
          db.run(
            `UPDATE accounts 
             SET balance = balance - ? 
             WHERE name = ? AND balance >= ?`,
            [amount, category, amount],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
                return;
              }

              if (this.changes === 0) {
                db.run('ROLLBACK');
                reject(new Error('Insufficient funds'));
                return;
              }

              db.run('COMMIT');
              resolve({ success: true });
            }
          );
        }
      );
    });
  });
});

ipcMain.handle('add-deposit', async (event, deposit) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Add the deposit record
      db.run(
        `INSERT INTO deposits (description, category, amount, account, date) 
         VALUES (?, ?, ?, ?, ?)`,
        [deposit.description, deposit.category, deposit.amount, deposit.account, deposit.date],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          // Update account balance
          db.run(
            `UPDATE accounts 
             SET balance = balance + ? 
             WHERE name = ?`,
            [deposit.amount, deposit.account],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
                return;
              }

              db.run('COMMIT');
              resolve({ success: true });
            }
          );
        }
      );
    });
  });
});

ipcMain.handle('verify-balance', async (event, accountName) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 
        a.balance as current_balance,
        (SELECT COALESCE(SUM(amount), 0) FROM deposits WHERE account = ?) as total_deposits,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE category = ?) as total_expenses
      FROM accounts a
      WHERE a.name = ?`,
      [accountName, accountName, accountName],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      }
    );
  });
});

ipcMain.handle('correct-balance', async (event, { account, newBalance }) => {
  console.log(`Correcting balance for ${account} to ${newBalance}`);
  
  return new Promise((resolve, reject) => {
    // Get current balance first
    db.get(
      'SELECT balance FROM accounts WHERE name = ?',
      [account],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        const currentBalance = row ? row.balance : 0;
        const correction = newBalance - currentBalance;

        // Update the account balance
        db.run(
          `UPDATE accounts 
           SET balance = ? 
           WHERE name = ?`,
          [newBalance, account],
          function(err) {
            if (err) {
              reject(err);
              return;
            }

            resolve({ 
              success: true, 
              oldBalance: currentBalance,
              newBalance: newBalance,
              correction: correction 
            });
          }
        );
      }
    );
  });
});

ipcMain.handle('delete-account', async (event, accountName) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Delete associated expenses
      db.run(
        "DELETE FROM expenses WHERE category = ?",
        [accountName],
        (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          // Delete associated deposits
          db.run(
            "DELETE FROM deposits WHERE account = ?",
            [accountName],
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
                return;
              }

              // Delete the account
              db.run(
                "DELETE FROM accounts WHERE name = ?",
                [accountName],
                (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                  }

                  db.run('COMMIT');
                  resolve({ success: true });
                }
              );
            }
          );
        }
      );
    });
  });
});

ipcMain.handle('transfer', async (event, { amount, fromAccount, toAccount }) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Deduct from source account
        db.run(
          `UPDATE accounts 
           SET balance = balance - ? 
           WHERE name = ? AND balance >= ?`,
          [amount, fromAccount, amount],
          function(err) {
            if (err) {
              db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) console.error('Rollback error:', rollbackErr);
                reject(err);
              });
              return;
            }
            if (this.changes === 0) {
              db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) console.error('Rollback error:', rollbackErr);
                reject(new Error('Insufficient funds or account not found'));
              });
              return;
            }

            // Add to destination account
            db.run(
              `UPDATE accounts 
               SET balance = balance + ? 
               WHERE name = ?`,
              [amount, toAccount],
              function(err) {
                if (err) {
                  db.run('ROLLBACK', (rollbackErr) => {
                    if (rollbackErr) console.error('Rollback error:', rollbackErr);
                    reject(err);
                  });
                  return;
                }
                if (this.changes === 0) {
                  db.run('ROLLBACK', (rollbackErr) => {
                    if (rollbackErr) console.error('Rollback error:', rollbackErr);
                    reject(new Error('Destination account not found'));
                  });
                  return;
                }

                db.run('COMMIT', function(err) {
                  if (err) {
                    db.run('ROLLBACK', (rollbackErr) => {
                      if (rollbackErr) console.error('Rollback error:', rollbackErr);
                      reject(err);
                    });
                    return;
                  }

                  resolve({ success: true });
                });
              }
            );
          }
        );
      });
    });
  });
});

ipcMain.handle('generate-report', async (event, { startDate, endDate }) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        expenseCategory,
        category as account,
        amount
      FROM expenses 
      WHERE payPeriod BETWEEN ? AND ?
    `;

    db.all(query, [startDate, endDate], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      // Initialize report object
      const report = {
        byExpenseCategory: {},
        byAccount: {},
        totalExpenses: 0
      };

      // Process the results
      rows.forEach(row => {
        // Sum by expense category
        report.byExpenseCategory[row.expenseCategory] = 
          (report.byExpenseCategory[row.expenseCategory] || 0) + row.amount;

        // Sum by account
        report.byAccount[row.account] = 
          (report.byAccount[row.account] || 0) + row.amount;

        // Add to total
        report.totalExpenses += row.amount;
      });

      resolve(report);
    });
  });
});

ipcMain.handle('generate-deposit-report', async (event, { startDate, endDate }) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        category,
        account,
        amount,
        date
      FROM deposits 
      WHERE date BETWEEN ? AND ?
    `;

    db.all(query, [startDate, endDate], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      const report = {
        byCategory: {},
        byAccount: {},
        totalDeposits: 0
      };

      rows.forEach(row => {
        // Sum by category
        report.byCategory[row.category] = 
          (report.byCategory[row.category] || 0) + row.amount;

        // Sum by account
        report.byAccount[row.account] = 
          (report.byAccount[row.account] || 0) + row.amount;

        // Add to total
        report.totalDeposits += row.amount;
      });

      resolve(report);
    });
  });
});

// ...existing code...