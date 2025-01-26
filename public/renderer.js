// Declare variables at the top
let expenses = [];
let balances = {
  'Bills': 0,
  'Gas Fund': 0,
  'Emergency Fund': 0,
  "Daughter's Account": 0,
  'Planned': 0
};
let accounts = [];

console.log('window.electron:', window.electron);

// Define all functions first
function loadExpenses() {
  return window.electron.ipcRenderer.invoke('load-expenses')
    .then(loadedExpenses => {
      expenses = loadedExpenses;
      updateExpenseList();
    })
    .catch(error => console.error('Error loading expenses:', error));
}

function loadBalances() {
  return window.electron.ipcRenderer.invoke('load-balances')
    .then(loadedBalances => {
      balances = loadedBalances.reduce((acc, row) => {
        acc[row.account] = parseFloat(row.amount); // Ensure balance is a number
        return acc;
      }, {});
      updateBalances();
    })
    .catch(error => console.error('Error loading balances:', error));
}

function deposit(amount, account) {
  console.log(`Initiating deposit: $${amount} to ${account}`); // Debug log

  window.electron.ipcRenderer.invoke('add-deposit', {
    description: 'Deposit',
    category: 'Deposit',
    amount: parseFloat(amount), // Ensure amount is a number
    account: account,
    date: new Date().toISOString() // Use the current date
  })
    .then(result => {
      console.log('Deposit result:', result); // Debug log
      document.getElementById('deposit-form').reset();
      verifyAccountBalance(account) // Verify after deposit
        .then(() => loadBalances()); // Ensure balances are updated after verification
    })
    .catch(error => {
      console.error('Deposit error:', error);
      document.getElementById('deposit-amount').focus(); // Return focus to the amount field
      const amountField = document.getElementById('deposit-amount');
      amountField.disabled = false; // Explicitly enable the field
      amountField.value = ''; // Clear the field
      setTimeout(() => amountField.focus(), 100); // Return focus to the amount field with a small delay
    });
}

function transfer(amount, fromAccount, toAccount) {
  window.electron.ipcRenderer.invoke('transfer', { amount: parseFloat(amount), fromAccount, toAccount }) // Ensure amount is a number
    .then(() => {
      updateBalances();
      document.getElementById('transfer-form').reset();
    })
    .catch(error => {
      console.error('Error making transfer:', error);
      document.getElementById('transfer-form').reset(); // Reset the form
      resetAndFocusField('transfer-amount'); // Reset and focus the amount field
    });
}




// Account Management Functions
function loadAccounts() {
    window.electron.ipcRenderer.invoke('get-accounts')
        .then(loadedAccounts => {
            accounts = loadedAccounts;
            updateAccountsList();
            updateAccountDropdowns();
            updateDashboard();
        })
        .catch(error => console.error('Error loading accounts:', error));
}

function updateAccountsList() {
    const accountsList = document.getElementById('accounts-list');
    accountsList.innerHTML = '';
    
    accounts.forEach(account => {
        const div = document.createElement('div');
        div.className = 'account-item';
        div.innerHTML = `
            <span>${account.name}: $${account.balance.toFixed(2)}</span>
            <button class="delete-account-btn" data-account="${account.name}">Delete</button>
        `;
        accountsList.appendChild(div);
    });

    // Add delete event listeners
    document.querySelectorAll('.delete-account-btn').forEach(button => {
        button.addEventListener('click', () => deleteAccount(button.dataset.account));
    });
}

function updateAccountDropdowns() {
    const dropdowns = ['deposit-account', 'transfer-from', 'transfer-to', 'category', 'correction-account'];
    dropdowns.forEach(id => {
        const dropdown = document.getElementById(id);
        if (dropdown) {
            dropdown.innerHTML = '';
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.name;
                option.textContent = account.name;
                dropdown.appendChild(option);
            });
        }
    });
}

function deleteAccount(accountName) {
    if (accounts.length <= 1) {
        return;
    }

    if (confirm(`Are you sure you want to delete ${accountName}? This will delete all associated transactions.`)) {
        window.electron.ipcRenderer.invoke('delete-account', accountName)
            .then(() => {
                loadAccounts();
            })
            .catch(error => {
                console.error('Error deleting account:', error);
                resetAndFocusField('new-account-name'); // Reset and focus the account name field
            });
    } else {
        resetAndFocusField('new-account-name'); // Reset and focus the account name field
    }
}

// Deposit Functions
function handleDeposit(event) {
    event.preventDefault();
    const deposit = {
        description: document.getElementById('deposit-description').value,
        category: document.getElementById('deposit-category').value,
        amount: parseFloat(document.getElementById('deposit-amount').value), // Ensure amount is a number
        account: document.getElementById('deposit-account').value,
        date: document.getElementById('deposit-date').value
    };

    window.electron.ipcRenderer.invoke('add-deposit', deposit)
        .then(() => {
            document.getElementById('deposit-form').reset();
            return loadAccounts();
        })
        .then(() => loadBalances()) // Ensure balances are updated after accounts are loaded
        .catch(error => {
            console.error('Error making deposit:', error);
            document.getElementById('deposit-form').reset(); // Reset the form
            resetAndFocusField('deposit-amount'); // Reset and focus the amount field
        });
}

// Deposit Report Functions
function generateDepositReport(startDate, endDate) {
    window.electron.ipcRenderer.invoke('generate-deposit-report', { startDate, endDate })
        .then(report => {
            const resultsDiv = document.getElementById('deposit-report-results');
            resultsDiv.style.display = 'block';

            document.getElementById('deposit-date-range-display').textContent = 
                `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;

            // Update category totals
            const categoryList = document.getElementById('deposit-category-totals');
            categoryList.innerHTML = '';
            Object.entries(report.byCategory).forEach(([category, amount]) => {
                const li = document.createElement('li');
                li.className = `deposit-category ${category}`;
                li.textContent = `${category}: $${amount.toFixed(2)}`;
                categoryList.appendChild(li);
            });

            // Update account totals
            const accountList = document.getElementById('deposit-account-totals');
            accountList.innerHTML = '';
            Object.entries(report.byAccount).forEach(([account, amount]) => {
                const li = document.createElement('li');
                li.textContent = `${account}: $${amount.toFixed(2)}`;
                accountList.appendChild(li);
            });

            document.getElementById('total-deposits').textContent = 
                `Total Deposits: $${report.totalDeposits.toFixed(2)}`;
        })
        .catch(error => console.error('Error generating deposit report:', error));
}

// Wait for DOM to be fully loaded before adding event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded');

  // Check for window.electron
  if (!window.electron) {
    console.error('window.electron is not available');
    return;
  }

  // Get all required elements
  const refreshButton = document.getElementById('refresh-app');
  const expenseForm = document.getElementById('expense-form');
  const depositForm = document.getElementById('deposit-form');
  const transferForm = document.getElementById('transfer-form');

  // Add event listeners only if elements exist
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      console.log('Refreshing app...');
      location.reload();
    });
  }

  if (expenseForm) {
    expenseForm.addEventListener('submit', function(event) {
      event.preventDefault();
      
      const description = document.getElementById('description').value;
      const expenseCategory = document.getElementById('expense-category').value;
      const amount = parseFloat(document.getElementById('amount').value); // Ensure amount is a number
      const category = document.getElementById('category').value;
      const payPeriod = document.getElementById('pay-period').value;

      if (isNaN(amount) || amount <= 0) {
        document.getElementById('amount').value = '';
        document.getElementById('amount').focus();
        return;
      }

      const expense = { description, expenseCategory, amount, category, payPeriod };
      console.log('Adding expense:', expense);
      addExpense(expense);
    });
  }

  if (depositForm) {
    depositForm.addEventListener('submit', function(event) {
      event.preventDefault();
      const amount = parseFloat(document.getElementById('deposit-amount').value); // Ensure amount is a number
      const account = document.getElementById('deposit-account').value;

      if (!isNaN(amount) && account) {
        console.log('Depositing amount:', amount, 'to account:', account);
        deposit(amount, account);
      } else {
        document.getElementById('deposit-amount').focus(); // Return focus to the amount field
      }
    });
  }

  if (transferForm) {
    transferForm.addEventListener('submit', function(event) {
      event.preventDefault();
      const amount = parseFloat(document.getElementById('transfer-amount').value); // Ensure amount is a number
      const fromAccount = document.getElementById('transfer-from').value;
      const toAccount = document.getElementById('transfer-to').value;

      console.log('Transferring amount:', amount, 'from account:', fromAccount, 'to account:', toAccount);
      transfer(amount, fromAccount, toAccount);
    });
  }

  if (document.getElementById('report-form')) {
    document.getElementById('report-form').addEventListener('submit', function(event) {
      event.preventDefault();
      const startDate = document.getElementById('start-date').value;
      const endDate = document.getElementById('end-date').value;
      generateReport(startDate, endDate);
    });
  }

  // Initialize data
  loadAccounts();
  loadExpenses();

  // Account form listener
  document.getElementById('account-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('new-account-name').value;
    const balance = parseFloat(document.getElementById('initial-balance').value); // Ensure balance is a number
    
    window.electron.ipcRenderer.invoke('add-account', { name, balance })
        .then(() => {
            document.getElementById('account-form').reset();
            loadAccounts();
        })
        .catch(error => {
            console.error('Error adding account:', error);
            document.getElementById('new-account-name').focus(); // Return focus to the account name field
        });
  });

  // Remove duplicate event listener for deposit form
  // Deposit report form listener
  document.getElementById('deposit-report-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const startDate = document.getElementById('deposit-start-date').value;
    const endDate = document.getElementById('deposit-end-date').value;
    generateDepositReport(startDate, endDate);
  });

  // Add balance correction form listener
  const correctionForm = document.getElementById('balance-correction-form');
  if (correctionForm) {
    correctionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const account = document.getElementById('correction-account').value;
      const newBalance = parseFloat(document.getElementById('correction-amount').value); // Ensure new balance is a number

      if (confirm(`Are you sure you want to correct the balance of ${account} to $${newBalance.toFixed(2)}?`)) {
        window.electron.ipcRenderer.invoke('correct-balance', { account, newBalance })
          .then(result => {
            console.log('Balance correction result:', result);
            correctionForm.reset();
            loadAccounts();
          })
          .catch(error => {
            console.error('Error correcting balance:', error);
            document.getElementById('correction-amount').focus(); // Return focus to the correction amount field
          });
      }
    });
  }
});

// Add any remaining functions here
function updateExpenseList() {
  const expenseList = document.getElementById('expense-list');
  const recentTotalElement = document.getElementById('recent-total');
  if (!expenseList || !recentTotalElement) return;
  
  expenseList.innerHTML = '';
  expenseList.innerHTML = '<h4>Recent Expenses (Last 10)</h4>';
  
  let runningTotal = 0;
  expenses.forEach(expense => {
    const li = document.createElement('li');
    const date = new Date(expense.payPeriod).toLocaleDateString();
    li.textContent = `${date} - ${expense.description} - $${expense.amount.toFixed(2)} (${expense.expenseCategory}) [${expense.category}]`;
    expenseList.appendChild(li);
    runningTotal += expense.amount;
  });

  recentTotalElement.textContent = `Running Total: $${runningTotal.toFixed(2)}`;
}

function updateBalances() {
    loadAccounts();
}

function addExpense(expense) {
  // Ensure all required fields are present and valid
  if (!expense.description || !expense.expenseCategory || isNaN(expense.amount) || !expense.category || !expense.payPeriod) {
    return;
  }

  window.electron.ipcRenderer.invoke('add-expense', expense)
    .then(result => {
      console.log('Expense added:', result);
      document.getElementById('expense-form').reset();
      return loadExpenses();
    })
    .then(() => loadBalances()) // Ensure balances are updated after expenses are loaded
    .catch(error => {
      console.error('Error adding expense:', error);
      document.getElementById('expense-form').reset(); // Reset the form
      resetAndFocusField('amount'); // Reset and focus the amount field
    });
}

function generateReport(startDate, endDate) {
  window.electron.ipcRenderer.invoke('generate-report', { startDate, endDate })
    .then(report => {
      console.log('Report data:', report);
      
      // Show the results div
      const resultsDiv = document.getElementById('report-results');
      resultsDiv.style.display = 'block';

      // Display date range
      document.getElementById('date-range-display').textContent = 
        `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;

      // Display category totals
      const categoryList = document.getElementById('category-totals');
      categoryList.innerHTML = '';
      Object.entries(report.byExpenseCategory).forEach(([category, amount]) => {
        const li = document.createElement('li');
        li.textContent = `${category}: $${amount.toFixed(2)}`;
        categoryList.appendChild(li);
      });

      // Display account totals
      const accountList = document.getElementById('account-totals');
      accountList.innerHTML = '';
      Object.entries(report.byAccount).forEach(([account, amount]) => {
        const li = document.createElement('li');
        li.textContent = `${account}: $${amount.toFixed(2)}`;
        accountList.appendChild(li);
      });

      // Display total
      document.getElementById('total-expenses').textContent = 
        `Total Expenses: $${report.totalExpenses.toFixed(2)}`;
    })
    .catch(error => {
      console.error('Error generating report:', error);
    });
}

function updateDashboard() {
    const accountBalancesDiv = document.getElementById('account-balances');
    if (!accountBalancesDiv) return;

    accountBalancesDiv.innerHTML = ''; // Clear existing balances
    
    let totalBalance = 0;

    accounts.forEach(account => {
        // Create balance display for each account
        const p = document.createElement('p');
        p.id = `${account.name.toLowerCase().replace(/['\s]/g, '-')}-balance`;
        p.textContent = `${account.name}: $${account.balance.toFixed(2)}`;
        accountBalancesDiv.appendChild(p);
        
        totalBalance += account.balance;
    });

    // Update total balance
    const totalBalanceElement = document.getElementById('total-balance');
    if (totalBalanceElement) {
        totalBalanceElement.textContent = `Total Balance: $${totalBalance.toFixed(2)}`;
    }
}

// Add this function to help debug balance issues
function verifyAccountBalance(accountName) {
    return window.electron.ipcRenderer.invoke('verify-balance', accountName)
        .then(result => {
            console.log('Balance verification for', accountName);
            console.log('Current balance:', result.current_balance);
            console.log('Total deposits:', result.total_deposits);
            console.log('Total expenses:', result.total_expenses);
            console.log('Expected balance:', result.total_deposits - result.total_expenses);
        })
        .catch(error => console.error('Error verifying balance:', error));
}

function resetAndFocusField(fieldId) {
  const field = document.getElementById(fieldId);
  if (field) {
    field.disabled = false; // Explicitly enable the field
    field.value = ''; // Clear the field
    setTimeout(() => field.focus(), 100); // Return focus to the field with a small delay
  }
}
