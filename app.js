import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, orderBy, getDocs, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let currentUser = null;
let categories = [];
let categorySettings = {};
let transactions = [];
let budgets = [];

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
           amount: parseInt(document.getElementById('transaction-amount').value) || 0,
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
   const amount = parseInt(value) || 0;
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

function renderTrends() {
   const content = document.getElementById('trends-content');
   
   const today = new Date();
   const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
   const prevMonth = `${today.getFullYear()}-${String(today.getMonth()).padStart(2, '0')}`;
   
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
   
   const increases = [];
   Object.keys(currentByCategory).forEach(cat => {
       const current = currentByCategory[cat];
       const prev = prevByCategory[cat] || 0;
       const change = current - prev;
       if (change > 0) {
           increases.push({ category: cat, change, current, prev });
       }
   });
   increases.sort((a, b) => b.change - a.change);
   
   let totalIncome = 0;
   let totalExpenses = 0;
   let totalSavings = 0;
   
   currentMonthTransactions.forEach(t => {
       const settings = categorySettings[t.category];
       if (settings?.isIncome) {
           totalIncome += t.amount;
       } else {
           totalExpenses += t.amount;
           if (settings?.isSavings) {
               totalSavings += t.amount;
           }
       }
   });
   
   let html = '<div class="trend-section">';
   html += '<h2>Month-over-Month Increases</h2>';
   if (increases.length > 0) {
       increases.slice(0, 5).forEach(item => {
           html += `<div class="trend-item">`;
           html += `<span class="trend-label">${item.category}</span>`;
           html += `<span class="trend-value trend-increase">+$${item.change} ($${item.prev} → $${item.current})</span>`;
           html += `</div>`;
       });
   } else {
       html += '<p>No increases this month</p>';
   }
   html += '</div>';
   
   html += '<div class="trend-section">';
   html += '<h2>Financial Summary</h2>';
   html += `<div class="trend-item"><span class="trend-label">Total Income</span><span class="trend-value">$${totalIncome}</span></div>`;
   html += `<div class="trend-item"><span class="trend-label">Total Expenses</span><span class="trend-value">$${totalExpenses}</span></div>`;
   html += `<div class="trend-item"><span class="trend-label">Total Savings</span><span class="trend-value">$${totalSavings}</span></div>`;
   html += `<div class="trend-item"><span class="trend-label">Net (Income - Expenses)</span><span class="trend-value ${totalIncome - totalExpenses >= 0 ? 'trend-decrease' : 'trend-increase'}">$${totalIncome - totalExpenses}</span></div>`;
   html += '</div>';
   
   content.innerHTML = html;
}
