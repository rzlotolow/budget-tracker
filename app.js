import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, orderBy, getDocs, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let currentUser = null;
let categories = [];
let categorySettings = {};
let transactions = [];
let budgets = [];
let selectedYears = new Set();

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');

signInBtn.addEventListener('click', async () => {
   const provider = new GoogleAuthProvider();
   try {
       await signInWithPopup(auth, provider);
   } catch (error) {
       alert('Sign in failed: ' + error.message);
   }
});

signOutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
   if (user) {
       currentUser = user;
       authContainer.style.display = 'none';
       appContainer.style.display = 'block';
       initApp();
   } else {
       currentUser = null;
       authContainer.style.display = 'flex';
       appContainer.style.display = 'none';
   }
});

function initApp() {
   setupTabs();
   setupTransactionForm();
   loadCategories();
   loadCategorySettings();
   loadTransactions();
   loadBudgets();
   setDefaultDate();
   setupCSVImport();
}

function setupTabs() {
   const tabBtns = document.querySelectorAll('.tab-btn');
   const tabContents = document.querySelectorAll('.tab-content');
   
   tabBtns.forEach(btn => {
       btn.addEventListener('click', () => {
           const tabName = btn.dataset.tab;
           
           tabBtns.forEach(b => b.classList.remove('active'));
           tabContents.forEach(c => c.classList.remove('active'));
           
           btn.classList.add('active');
           document.getElementById(`${tabName}-tab`).classList.add('active');
           
           if (tabName === 'history') renderHistory();
           if (tabName === 'budget') renderBudget();
           if (tabName === 'trends') renderTrends();
       });
   });
}

function setDefaultDate() {
   const dateInput = document.getElementById('transaction-date');
   const today = new Date();
   const year = today.getFullYear();
   const month = String(today.getMonth() + 1).padStart(2, '0');
   const day = String(today.getDate()).padStart(2, '0');
   dateInput.value = `${year}-${month}-${day}`;
}

function setupTransactionForm() {
   const form = document.getElementById('transaction-form');
   const categorySelect = document.getElementById('transaction-category');
   const newCategoryInput = document.getElementById('new-category-input');
   
   categorySelect.addEventListener('change', (e) => {
       if (e.target.value === '__new__') {
           newCategoryInput.style.display = 'block';
           newCategoryInput.required = true;
       } else {
           newCategoryInput.style.display = 'none';
           newCategoryInput.required = false;
           newCategoryInput.value = '';
       }
   });
   
   form.addEventListener('submit', async (e) => {
       e.preventDefault();
       
       let category = categorySelect.value;
       if (category === '__new__') {
           category = newCategoryInput.value.trim();
           if (!category) {
               alert('Please enter a category name');
               return;
           }
           if (!categories.includes(category)) {
               await addCategory(category);
           }
       }
       
       const dateInput = document.getElementById('transaction-date').value;
       const date = new Date(dateInput + 'T00:00:00');
       
       const transaction = {
           userId: currentUser.uid,
           date: date,
           category: category,
           place: document.getElementById('transaction-place').value.trim(),
           amount: parseFloat(document.getElementById('transaction-amount').value) || 0,
           person: document.getElementById('transaction-person').value,
           notes: document.getElementById('transaction-notes').value.trim(),
           is_deleted: false,
           created_at: new Date()
       };
       
       try {
           await addDoc(collection(db, 'transactions'), transaction);
           form.reset();
           setDefaultDate();
           categorySelect.value = '';
           newCategoryInput.style.display = 'none';
           alert('Transaction added!');
       } catch (error) {
           alert('Error adding transaction: ' + error.message);
       }
   });
}

async function addCategory(category) {
   try {
       await addDoc(collection(db, 'categories'), {
           userId: currentUser.uid,
           name: category,
           created_at: new Date()
       });
       await setDoc(doc(db, 'categorySettings', `${currentUser.uid}_${category}`), {
           userId: currentUser.uid,
           category: category,
           isSavings: false,
           isIncome: false
       });
   } catch (error) {
       console.error('Error adding category:', error);
   }
}

function loadCategories() {
   const q = query(collection(db, 'categories'), where('userId', '==', currentUser.uid));
   onSnapshot(q, (snapshot) => {
       categories = snapshot.docs.map(doc => doc.data().name).sort();
       updateCategoryDropdown();
   });
}

function loadCategorySettings() {
   const q = query(collection(db, 'categorySettings'), where('userId', '==', currentUser.uid));
   onSnapshot(q, (snapshot) => {
       categorySettings = {};
       snapshot.docs.forEach(doc => {
           const data = doc.data();
           categorySettings[data.category] = {
               isSavings: data.isSavings || false,
               isIncome: data.isIncome || false
           };
       });
   });
}

function updateCategoryDropdown() {
   const select = document.getElementById('transaction-category');
   const currentValue = select.value;
   
   select.innerHTML = '<option value="">Select Category</option>';
   categories.forEach(cat => {
       const option = document.createElement('option');
       option.value = cat;
       option.textContent = cat;
       select.appendChild(option);
   });
   
   const newOption = document.createElement('option');
   newOption.value = '__new__';
   newOption.textContent = '+ Add New Category';
   select.appendChild(newOption);
   
   if (currentValue && currentValue !== '__new__') {
       select.value = currentValue;
   }
}

function loadTransactions() {
   const q = query(
       collection(db, 'transactions'),
       where('userId', '==', currentUser.uid),
       where('is_deleted', '==', false),
       orderBy('date', 'desc')
   );
   
   onSnapshot(q, (snapshot) => {
       transactions = snapshot.docs.map(doc => ({
           id: doc.id,
           ...doc.data()
       }));
   });
}

function loadBudgets() {
   const q = query(collection(db, 'budgets'), where('userId', '==', currentUser.uid));
   onSnapshot(q, (snapshot) => {
       budgets = snapshot.docs.map(doc => ({
           id: doc.id,
           ...doc.data()
       }));
   });
}

function getAvailableMonths() {
   const months = new Set();
   transactions.forEach(t => {
       const d = t.date.toDate();
       const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
       months.add(monthStr);
   });
   return Array.from(months).sort().reverse();
}

function formatMonthYear(monthStr) {
   const [year, month] = monthStr.split('-');
   const date = new Date(year, month - 1);
   return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function renderHistory() {
   const monthSelect = document.getElementById('history-month-select');
   const content = document.getElementById('history-content');
   
   const months = getAvailableMonths();
   
   const currentSelection = monthSelect.value;
   
   monthSelect.innerHTML = '';
   months.forEach((month, index) => {
       const option = document.createElement('option');
       option.value = month;
       option.textContent = formatMonthYear(month);
       if (index < 3) option.textContent += ' ⭐';
       monthSelect.appendChild(option);
   });
   
   const selectedMonth = currentSelection || (months.length > 0 ? months[0] : null);
   
   if (!selectedMonth) {
       content.innerHTML = '<div class="empty-state"><h3>No transactions yet</h3><p>Add your first transaction to get started!</p></div>';
       return;
   }
   
   monthSelect.value = selectedMonth;
   
   monthSelect.onchange = (e) => {
       renderHistoryForMonth(e.target.value);
   };
   
   renderHistoryForMonth(selectedMonth);
}

function renderHistoryForMonth(selectedMonth) {
   const content = document.getElementById('history-content');
   
   const [year, month] = selectedMonth.split('-').map(Number);
   const monthTransactions = transactions.filter(t => {
       const d = t.date.toDate();
       return d.getFullYear() === year && d.getMonth() + 1 === month;
   });
   
   const byCategory = {};
   monthTransactions.forEach(t => {
       if (!byCategory[t.category]) byCategory[t.category] = [];
       byCategory[t.category].push(t);
   });
   
   const monthBudgets = budgets.filter(b => b.month === selectedMonth);
   const budgetMap = {};
   monthBudgets.forEach(b => {
       budgetMap[b.category] = b.amount;
   });
   
   let html = '';
   Object.keys(byCategory).sort().forEach(category => {
       const items = byCategory[category];
       const total = items.reduce((sum, t) => sum + t.amount, 0);
       const budget = budgetMap[category];
       
       let budgetText = '';
       if (budget !== undefined) {
           budgetText = ` (Budget: $${budget})`;
       }
       
       html += `<div class="category-group">`;
       html += `<h3><span>${category}</span><span class="category-total">$${total}${budgetText}</span></h3>`;
       
       items.sort((a, b) => b.date.toDate() - a.date.toDate()).forEach(t => {
           const date = t.date.toDate();
           html += `<div class="transaction-item">`;
           html += `<div class="transaction-info">`;
           html += `<div class="transaction-date">${date.toLocaleDateString()}</div>`;
           html += `<div class="transaction-place">${t.place}</div>`;
           html += `<div class="transaction-person">${t.person}</div>`;
           if (t.notes) html += `<div class="transaction-notes">${t.notes}</div>`;
           html += `</div>`;
           html += `<div class="transaction-right">`;
           html += `<div class="transaction-amount">$${t.amount}</div>`;
           html += `<button class="delete-btn" onclick="deleteTransaction('${t.id}')">Delete</button>`;
           html += `</div>`;
           html += `</div>`;
       });
       
       html += `</div>`;
   });
   
   content.innerHTML = html || '<div class="empty-state"><h3>No transactions this month</h3></div>';
}

window.deleteTransaction = async function(id) {
   if (!confirm('Delete this transaction?')) return;
   try {
       await updateDoc(doc(db, 'transactions', id), { is_deleted: true });
   } catch (error) {
       alert('Error deleting transaction: ' + error.message);
   }
};

function calculate6MonthAvg(category) {
   const today = new Date();
   const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1);
   const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
   
   const relevantTransactions = transactions.filter(t => {
       const d = t.date.toDate();
       return t.category === category && d >= sixMonthsAgo && d <= lastMonthEnd;
   });
   
   const monthTotals = {};
   relevantTransactions.forEach(t => {
       const d = t.date.toDate();
       const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
       monthTotals[monthKey] = (monthTotals[monthKey] || 0) + t.amount;
   });
   
   const completedMonths = Object.keys(monthTotals).length;
   if (completedMonths === 0) return 0;
   
   const total = Object.values(monthTotals).reduce((sum, val) => sum + val, 0);
   return Math.round(total / completedMonths);
}




function renderBudget() {
   const monthSelect = document.getElementById('budget-month-select');
   const content = document.getElementById('budget-content');
   const reminder = document.getElementById('budget-reminder');
   
   const today = new Date();
   const daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
   
   if (daysLeft <= 5) {
       const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
       const nextMonthStr = formatMonthYear(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`);
       reminder.textContent = `⏰ ${daysLeft} days left in the month! Set budget for ${nextMonthStr}`;
       reminder.classList.add('show');
   } else {
       reminder.classList.remove('show');
   }
   
   const months = getAvailableMonths();
   const nextMonth = `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}`;
   if (!months.includes(nextMonth)) months.unshift(nextMonth);
   
   const currentSelection = monthSelect.value;
   
   monthSelect.innerHTML = '';
   months.forEach((month, index) => {
       const option = document.createElement('option');
       option.value = month;
       option.textContent = formatMonthYear(month);
       if (index < 3) option.textContent += ' ⭐';
       monthSelect.appendChild(option);
   });
   
   const selectedMonth = currentSelection || (months.length > 0 ? months[0] : null);
   
   if (!selectedMonth) {
       content.innerHTML = '<div class="empty-state"><h3>No data yet</h3></div>';
       return;
   }
   
   monthSelect.value = selectedMonth;
   
   monthSelect.onchange = (e) => {
       renderBudgetForMonth(e.target.value);
   };
   
   renderBudgetForMonth(selectedMonth);
}

function renderBudgetForMonth(selectedMonth) {
   const content = document.getElementById('budget-content');
   
   const [year, month] = selectedMonth.split('-').map(Number);
   const monthTransactions = transactions.filter(t => {
       const d = t.date.toDate();
       return d.getFullYear() === year && d.getMonth() + 1 === month;
   });
   
   const actualByCategory = {};
   monthTransactions.forEach(t => {
       actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
   });
   
   const monthBudgets = budgets.filter(b => b.month === selectedMonth);
   const budgetData = {};
   monthBudgets.forEach(b => {
       budgetData[b.category] = {
           id: b.id,
           amount: b.amount
       };
   });
   
   const allCategories = new Set([...categories, ...Object.keys(actualByCategory)]);
   
   let html = '<table class="budget-table"><thead><tr>';
   html += '<th>Category</th>';
   html += '<th>Savings</th>';
   html += '<th>Income</th>';
   html += '<th>6-Mo Avg</th>';
   html += '<th>Budget</th>';
   html += '<th>Actual</th>';
   html += '</tr></thead><tbody>';
   
   Array.from(allCategories).sort().forEach(category => {
       const budget = budgetData[category];
       const actual = actualByCategory[category] || 0;
       const avg = calculate6MonthAvg(category);
       const settings = categorySettings[category] || { isSavings: false, isIncome: false };
       
       let rowClass = '';
       if (budget && budget.amount > 0 && actual > 0) {
           rowClass = actual <= budget.amount ? 'budget-met' : 'budget-exceeded';
       }
       
       html += `<tr class="${rowClass}">`;
       html += `<td>${category}</td>`;
       html += `<td><input type="checkbox" ${settings.isSavings ? 'checked' : ''} onchange="updateCategoryFlag('${category}', 'isSavings', this.checked)"></td>`;
       html += `<td><input type="checkbox" ${settings.isIncome ? 'checked' : ''} onchange="updateCategoryFlag('${category}', 'isIncome', this.checked)"></td>`;
       html += `<td>$${avg}</td>`;
       html += `<td><input type="number" value="${budget?.amount || 0}" onchange="updateBudgetAmount('${category}', '${selectedMonth}', this.value)"></td>`;
       html += `<td>$${actual}</td>`;
       html += '</tr>';
   });
   
   html += '</tbody></table>';
   content.innerHTML = html;
}

window.updateBudgetAmount = async function(category, month, value) {
   const amount = parseFloat(value) || 0;
   const existing = budgets.find(b => b.category === category && b.month === month);
   
   try {
       if (existing) {
           await updateDoc(doc(db, 'budgets', existing.id), { amount });
       } else {
           await addDoc(collection(db, 'budgets'), {
               userId: currentUser.uid,
               category,
               month,
               amount,
               created_at: new Date()
           });
       }
   } catch (error) {
       alert('Error updating budget: ' + error.message);
   }
};

window.updateCategoryFlag = async function(category, flag, value) {
   try {
       await setDoc(doc(db, 'categorySettings', `${currentUser.uid}_${category}`), {
           userId: currentUser.uid,
           category: category,
           [flag]: value,
           [flag === 'isSavings' ? 'isIncome' : 'isSavings']: categorySettings[category]?.[flag === 'isSavings' ? 'isIncome' : 'isSavings'] || false
       }, { merge: true });
   } catch (error) {
       alert('Error updating category: ' + error.message);
   }
};

function getAvailableYears() {
   const years = new Set();
   transactions.forEach(t => {
       const d = t.date.toDate();
       years.add(d.getFullYear());
   });
   return Array.from(years).sort();
}

function getLastTwoCompleteMonths() {
   const today = new Date();
   const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
   const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
   
   const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
   const twoMonthsAgoStr = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
   
   return { current: lastMonthStr, previous: twoMonthsAgoStr };
}

window.toggleYear = function(year) {
   if (selectedYears.has(year)) {
       selectedYears.delete(year);
   } else {
       selectedYears.add(year);
   }
   renderTrends();
};

function renderTrends() {
   const content = document.getElementById('trends-content');
   
   const availableYears = getAvailableYears();
   if (selectedYears.size === 0) {
       availableYears.forEach(y => selectedYears.add(y));
   }
   
   const { current: currentMonth, previous: prevMonth } = getLastTwoCompleteMonths();
   
   const currentMonthTransactions = transactions.filter(t => {
       const d = t.date.toDate();
       return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonth;
   });
   
   const prevMonthTransactions = transactions.filter(t => {
       const d = t.date.toDate();
       return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === prevMonth;
   });
   
   const currentByCategory = {};
   currentMonthTransactions.forEach(t => {
       currentByCategory[t.category] = (currentByCategory[t.category] || 0) + t.amount;
   });
   
   const prevByCategory = {};
   prevMonthTransactions.forEach(t => {
       prevByCategory[t.category] = (prevByCategory[t.category] || 0) + t.amount;
   });
   
   const allCategories = new Set([...Object.keys(currentByCategory), ...Object.keys(prevByCategory)]);
   const changes = [];
   
   allCategories.forEach(cat => {
       const current = currentByCategory[cat] || 0;
       const prev = prevByCategory[cat] || 0;
       const change = current - prev;
       
       if (change !== 0) {
           let percentChange = 'N/A';
           if (prev === 0 && current > 0) {
               percentChange = 'N/A';
           } else if (prev > 0) {
               percentChange = Math.round((change / prev) * 100);
           }
           
           changes.push({ category: cat, change, current, prev, percentChange });
       }
   });
   
   changes.sort((a, b) => a.category.localeCompare(b.category));
   
   const filteredTransactions = transactions.filter(t => {
       const d = t.date.toDate();
       return selectedYears.has(d.getFullYear());
   });
   
   let totalIncome = 0;
   let totalExpenses = 0;
   let totalSavings = 0;
   let rogerIncome = 0;
   let reaganIncome = 0;
   let bothIncome = 0;
   let rogerExpense = 0;
   let reaganExpense = 0;
   let bothExpense = 0;
   
   filteredTransactions.forEach(t => {
       const settings = categorySettings[t.category];
       if (settings?.isIncome) {
           totalIncome += t.amount;
           if (t.person === 'Roger') rogerIncome += t.amount;
           else if (t.person === 'Raegan') reaganIncome += t.amount;
           else if (t.person === 'Both') bothIncome += t.amount;
       } else {
           totalExpenses += t.amount;
           if (t.person === 'Roger') rogerExpense += t.amount;
           else if (t.person === 'Raegan') reaganExpense += t.amount;
           else if (t.person === 'Both') bothExpense += t.amount;
           
           if (settings?.isSavings) {
               totalSavings += t.amount;
           }
       }
   });
   
   const totalIncomeCalc = rogerIncome + reaganIncome + bothIncome;
   const totalExpenseCalc = rogerExpense + reaganExpense + bothExpense;
   
   let rogerIncomePercent = 0;
   let reaganIncomePercent = 0;
   if (totalIncomeCalc > 0) {
       rogerIncomePercent = Math.round(((rogerIncome + 0.5 * bothIncome) / totalIncomeCalc) * 100);
       reaganIncomePercent = 100 - rogerIncomePercent;
   }
   
   let rogerExpensePercent = 0;
   let reaganExpensePercent = 0;
   if (totalExpenseCalc > 0) {
       rogerExpensePercent = Math.round(((rogerExpense + 0.5 * bothExpense) / totalExpenseCalc) * 100);
       reaganExpensePercent = 100 - rogerExpensePercent;
   }
   
   let html = '<div class="trend-section">';
   html += '<h2>Month-over-Month Changes</h2>';
   html += `<p style="color: #666; margin-bottom: 1rem;">${formatMonthYear(currentMonth)} vs ${formatMonthYear(prevMonth)}</p>`;
   
   if (changes.length > 0) {
       changes.forEach(item => {
           const sign = item.change > 0 ? '+' : '';
           const colorClass = item.change > 0 ? 'trend-increase' : 'trend-decrease';
           const percentStr = item.percentChange === 'N/A' ? 'N/A' : `${sign}${item.percentChange}% MoM`;
           
           html += `<div class="trend-item">`;
           html += `<span class="trend-label">${item.category}:</span>`;
           html += `<span class="trend-value ${colorClass}">${sign}$${item.change} ($${item.prev} → $${item.current}) (${percentStr})</span>`;
           html += `</div>`;
       });
   } else {
       html += '<p>No changes between these months</p>';
   }
   html += '</div>';
   
   html += '<div class="trend-section">';
   html += '<h2>Financial Summary</h2>';
   html += '<div style="margin-bottom: 1rem;">';
   availableYears.forEach(year => {
       const isActive = selectedYears.has(year);
       html += `<button onclick="toggleYear(${year})" style="margin: 0.25rem; background: ${isActive ? '#4CAF50' : '#ccc'};">${year}</button>`;
   });
   html += '</div>';
   
   html += `<div class="trend-item"><span class="trend-label">Total Income</span><span class="trend-value">$${totalIncome}</span></div>`;
   html += `<div class="trend-item"><span class="trend-label">Total Expenses</span><span class="trend-value">$${totalExpenses}</span></div>`;
   html += `<div class="trend-item"><span class="trend-label">Total Savings</span><span class="trend-value">$${totalSavings}</span></div>`;
   html += `<div class="trend-item"><span class="trend-label">Net (Income - Expenses)</span><span class="trend-value ${totalIncome - totalExpenses >= 0 ? 'trend-decrease' : 'trend-increase'}">$${totalIncome - totalExpenses}</span></div>`;
   html += `<div class="trend-item"><span class="trend-label">Roger: ${rogerIncomePercent}% of Income</span><span class="trend-label">Raegan: ${reaganIncomePercent}% of Income</span></div>`;
   html += `<div class="trend-item"><span class="trend-label">Roger: ${rogerExpensePercent}% of Expenses</span><span class="trend-label">Raegan: ${reaganExpensePercent}% of Expenses</span></div>`;
   html += '</div>';
   
   content.innerHTML = html;
}





function setupCSVImport() {
   const importBtn = document.getElementById('import-csv-btn');
   const fileInput = document.getElementById('csv-file-input');
   const previewDiv = document.getElementById('import-preview');
   const previewCount = document.getElementById('preview-count');
   const previewList = document.getElementById('preview-list');
   const confirmBtn = document.getElementById('confirm-import-btn');
   const cancelBtn = document.getElementById('cancel-import-btn');
   
   let parsedTransactions = [];
   
   importBtn.addEventListener('click', () => {
       fileInput.click();
   });
   
   fileInput.addEventListener('change', (e) => {
       const file = e.target.files[0];
       if (!file) return;
       
       const reader = new FileReader();
       reader.onload = (event) => {
           const csv = event.target.result;
           parsedTransactions = parseCSV(csv);
           
           if (parsedTransactions.length === 0) {
               alert('No valid transactions found in CSV');
               return;
           }
           
           previewCount.textContent = `Found ${parsedTransactions.length} transactions`;
           
           let html = '<div style="font-size: 0.9rem;">';
           parsedTransactions.slice(0, 10).forEach(t => {
               html += `<div style="padding: 0.5rem; border-bottom: 1px solid #eee;">`;
               html += `${t.date.toLocaleDateString()} - ${t.category} - ${t.place} - $${t.amount} - ${t.person}`;
               html += `</div>`;
           });
           if (parsedTransactions.length > 10) {
               html += `<div style="padding: 0.5rem; color: #666;">...and ${parsedTransactions.length - 10} more</div>`;
           }
           html += '</div>';
           
           previewList.innerHTML = html;
           previewDiv.style.display = 'block';
       };
       reader.readAsText(file);
   });
   
   confirmBtn.addEventListener('click', async () => {
       confirmBtn.disabled = true;
       confirmBtn.textContent = 'Importing...';
       
       try {
           for (const transaction of parsedTransactions) {
               if (!categories.includes(transaction.category)) {
                   await addCategory(transaction.category);
               }
               
               await addDoc(collection(db, 'transactions'), {
                   userId: currentUser.uid,
                   date: transaction.date,
                   category: transaction.category,
                   place: transaction.place,
                   amount: transaction.amount,
                   person: transaction.person,
                   notes: '',
                   is_deleted: false,
                   created_at: new Date()
               });
           }
           
           alert(`Successfully imported ${parsedTransactions.length} transactions!`);
           previewDiv.style.display = 'none';
           fileInput.value = '';
           parsedTransactions = [];
       } catch (error) {
           alert('Error importing: ' + error.message);
       } finally {
           confirmBtn.disabled = false;
           confirmBtn.textContent = 'Import All';
       }
   });
   
   cancelBtn.addEventListener('click', () => {
       previewDiv.style.display = 'none';
       fileInput.value = '';
       parsedTransactions = [];
   });
}

function parseCSV(csv) {
   const lines = csv.split('\n').filter(line => line.trim());
   const transactions = [];
   
   for (let i = 1; i < lines.length; i++) {
       const line = lines[i].trim();
       if (!line) continue;
       
       let parts;
       
       if (line.includes('\t')) {
           parts = line.split('\t').map(p => p.trim());
       } else {
           const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
           parts = line.split(regex).map(p => p.trim().replace(/^"|"$/g, ''));
       }
       
       parts = parts.filter(p => p.length > 0);
       
       if (parts.length < 5) {
           console.log('Skipping line (not enough columns):', line);
           continue;
       }
       
       const category = parts[0];
       const dateStr = parts[1];
       const place = parts[2];
       const amountStr = parts[3].replace(/[$,"]/g, '');
       const amount = parseFloat(amountStr) || 0;
       const person = parts[4];
       
       if (!category || !dateStr || !place || !person) {
           console.log('Skipping line (missing data):', line);
           continue;
       }
       
       if (person !== 'Roger' && person !== 'Raegan' && person !== 'Both') {
           console.log('Skipping line (invalid person):', person, line);
           continue;
       }
       
       let date;
       if (dateStr.includes('/')) {
           const dateParts = dateStr.split('/');
           if (dateParts.length === 3) {
               const [month, day, year] = dateParts;
               date = new Date(year, month - 1, day);
           }
       } else if (dateStr.includes('-')) {
           date = new Date(dateStr + 'T00:00:00');
       }
       
       if (!date || isNaN(date.getTime())) {
           console.log('Skipping line (invalid date):', dateStr, line);
           continue;
       }
       
       transactions.push({
           category,
           date,
           place,
           amount,
           person
       });
   }
   
   console.log(`Successfully parsed ${transactions.length} transactions`);
   return transactions;
}
