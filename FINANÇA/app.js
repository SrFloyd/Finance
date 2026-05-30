const STORAGE_KEY = "financeflow_transactions_v2";

const incomeCategories = [
  "Salário", "Freelance", "Investimentos", "Vendas", "Reembolso", "Outros"
];

const expenseCategories = [
  "Moradia", "Alimentação", "Transporte", "Saúde", "Educação",
  "Lazer", "Assinaturas", "Compras", "Contas", "Outros"
];

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit"
});

const state = {
  charts: {
    expenseCategory: null,
    balanceLine: null,
    monthlyComparison: null
  }
};

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readTransactions() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeTransactions(transactions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function getCategoryList(type) {
  return type === "despesa" ? expenseCategories : incomeCategories;
}

function updateCategoryOptions(typeSelect, categorySelect, preserveValue = true) {
  if (!typeSelect || !categorySelect) return;

  const categories = getCategoryList(typeSelect.value);
  const previous = preserveValue ? categorySelect.value : "";
  categorySelect.innerHTML = categories
    .map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
    .join("");

  if (previous && categories.includes(previous)) {
    categorySelect.value = previous;
  }
}

function getYears(transactions) {
  const years = [...new Set(
    transactions
      .filter(item => item.date)
      .map(item => new Date(`${item.date}T00:00:00`).getFullYear())
      .filter(Number.isFinite)
  )].sort((a, b) => b - a);

  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.unshift(currentYear);
  return years;
}

function populateYearSelect(select, selectedValue = "") {
  if (!select) return;
  const years = getYears(readTransactions());
  select.innerHTML = `<option value="">Todos</option>${years
    .map(year => `<option value="${year}">${year}</option>`)
    .join("")}`;

  if (selectedValue && years.includes(Number(selectedValue))) {
    select.value = selectedValue;
  }
}

function filterTransactions(transactions, month = "", year = "") {
  return transactions
    .filter(item => {
      const date = new Date(`${item.date}T00:00:00`);
      const matchesMonth = month === "" ? true : date.getMonth() === Number(month);
      const matchesYear = year === "" ? true : date.getFullYear() === Number(year);
      return matchesMonth && matchesYear;
    })
    .sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`));
}

function summarize(transactions) {
  const incomes = transactions
    .filter(item => item.type === "receita")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const expenses = transactions
    .filter(item => item.type === "despesa")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  return {
    incomes,
    expenses,
    balance: incomes - expenses,
    count: transactions.length
  };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderSummaryCards(transactions) {
  const { incomes, expenses, balance } = summarize(transactions);

  const saldoEl = document.getElementById("saldoTotal");
  if (saldoEl) {
    saldoEl.textContent = brl.format(balance);
    saldoEl.className = `value ${balance > 0 ? "positive" : balance < 0 ? "negative" : "neutral"}`;
  }

  setText("receitasTotal", brl.format(incomes));
  setText("despesasTotal", brl.format(expenses));
  setText("quantidadeLancamentos", `${transactions.length} lançamento${transactions.length === 1 ? "" : "s"}`);
}

function renderTable(tableBodyId, emptyStateId, transactions, options = {}) {
  const tableBody = document.getElementById(tableBodyId);
  const emptyState = document.getElementById(emptyStateId);
  if (!tableBody || !emptyState) return;

  const showDelete = options.showDelete !== false;

  if (!transactions.length) {
    tableBody.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  tableBody.innerHTML = transactions.map(item => {
    const date = new Date(`${item.date}T00:00:00`).toLocaleDateString("pt-BR");
    const isIncome = item.type === "receita";
    const signal = isIncome ? "+" : "-";
    const tag = isIncome
      ? '<span class="tag tag-income">Receita</span>'
      : '<span class="tag tag-expense">Despesa</span>';

    return `
      <tr>
        <td>${date}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>${tag}</td>
        <td class="${isIncome ? "positive" : "negative"}" style="font-weight:700;">${signal} ${brl.format(Number(item.amount))}</td>
        <td>${showDelete ? `<button class="danger-link" data-delete-id="${item.id}">Excluir</button>` : "—"}</td>
      </tr>
    `;
  }).join("");
}

function getExpenseCategoryData(transactions) {
  const expenseMap = {};
  transactions
    .filter(item => item.type === "despesa")
    .forEach(item => {
      expenseMap[item.category] = (expenseMap[item.category] || 0) + Number(item.amount);
    });

  return {
    labels: Object.keys(expenseMap),
    values: Object.values(expenseMap)
  };
}

function getRunningBalanceData(transactions) {
  const ordered = [...transactions].sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));
  let accumulated = 0;

  return {
    labels: ordered.map(item => new Date(`${item.date}T00:00:00`).toLocaleDateString("pt-BR")),
    values: ordered.map(item => {
      accumulated += item.type === "receita" ? Number(item.amount) : -Number(item.amount);
      return accumulated;
    })
  };
}

function getLastSixMonthsComparison(allTransactions) {
  const now = new Date();
  const months = [];

  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: monthFormatter.format(date) });
  }

  const incomeValues = [];
  const expenseValues = [];

  months.forEach(month => {
    const monthTransactions = allTransactions.filter(item => item.date.startsWith(month.key));
    incomeValues.push(
      monthTransactions
        .filter(item => item.type === "receita")
        .reduce((sum, item) => sum + Number(item.amount), 0)
    );
    expenseValues.push(
      monthTransactions
        .filter(item => item.type === "despesa")
        .reduce((sum, item) => sum + Number(item.amount), 0)
    );
  });

  return {
    labels: months.map(item => item.label),
    incomeValues,
    expenseValues
  };
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    state.charts[name] = null;
  }
}

function renderExpenseCategoryChart(transactions) {
  const canvas = document.getElementById("expenseCategoryChart");
  if (!canvas || typeof Chart === "undefined") return;

  const { labels, values } = getExpenseCategoryData(transactions);
  destroyChart("expenseCategory");

  state.charts.expenseCategory = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: labels.length ? labels : ["Sem dados"],
      datasets: [{
        data: values.length ? values : [1],
        backgroundColor: labels.length
          ? ["#6d7cff", "#8b5cf6", "#ec4899", "#f59e0b", "#22c55e", "#14b8a6", "#ef4444", "#3b82f6", "#a855f7", "#eab308"]
          : ["rgba(255,255,255,0.18)"],
        borderWidth: 0
      }]
    },
    options: baseChartOptions()
  });
}

function renderBalanceLineChart(transactions) {
  const canvas = document.getElementById("balanceLineChart");
  if (!canvas || typeof Chart === "undefined") return;

  const { labels, values } = getRunningBalanceData(transactions);
  destroyChart("balanceLine");

  state.charts.balanceLine = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["Sem dados"],
      datasets: [{
        label: "Saldo acumulado",
        data: values.length ? values : [0],
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        borderColor: "#6d7cff",
        backgroundColor: "rgba(109,124,255,0.16)",
        pointBackgroundColor: "#8b5cf6",
        pointRadius: 4
      }]
    },
    options: {
      ...baseChartOptions(),
      scales: lineScales()
    }
  });
}

function renderMonthlyComparisonChart(allTransactions) {
  const canvas = document.getElementById("monthlyComparisonChart");
  if (!canvas || typeof Chart === "undefined") return;

  const { labels, incomeValues, expenseValues } = getLastSixMonthsComparison(allTransactions);
  destroyChart("monthlyComparison");

  state.charts.monthlyComparison = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Receitas",
          data: incomeValues,
          backgroundColor: "rgba(34,197,94,0.65)",
          borderRadius: 12
        },
        {
          label: "Despesas",
          data: expenseValues,
          backgroundColor: "rgba(239,68,68,0.65)",
          borderRadius: 12
        }
      ]
    },
    options: {
      ...baseChartOptions(),
      scales: lineScales(),
      plugins: {
        ...baseChartOptions().plugins,
        legend: {
          labels: { color: "#dbe3ff" }
        }
      }
    }
  });
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#dbe3ff"
        }
      },
      tooltip: {
        callbacks: {
          label(context) {
            const label = context.dataset.label ? `${context.dataset.label}: ` : "";
            const value = typeof context.raw === "number" ? context.raw : Number(context.raw || 0);
            return `${label}${brl.format(value)}`;
          }
        }
      }
    }
  };
}

function lineScales() {
  return {
    x: {
      ticks: { color: "#aab3d1" },
      grid: { color: "rgba(255,255,255,0.06)" }
    },
    y: {
      ticks: {
        color: "#aab3d1",
        callback(value) {
          return brl.format(Number(value));
        }
      },
      grid: { color: "rgba(255,255,255,0.06)" }
    }
  };
}

function exportCSV() {
  const transactions = readTransactions();
  if (!transactions.length) {
    alert("Nenhum lançamento para exportar.");
    return;
  }

  const headers = ["id", "data", "descricao", "categoria", "tipo", "valor"];
  const rows = transactions.map(item => [
    item.id,
    item.date,
    item.description,
    item.category,
    item.type,
    item.amount
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "financeflow-lancamentos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  const confirmed = confirm("Tem certeza que deseja apagar todos os lançamentos?");
  if (!confirmed) return;
  writeTransactions([]);
  window.dispatchEvent(new CustomEvent("financeflow:updated"));
}

function addTransaction(payload) {
  const transaction = {
    id: crypto.randomUUID(),
    description: String(payload.description || "").trim(),
    amount: Number(payload.amount),
    date: payload.date,
    type: payload.type,
    category: payload.category
  };

  if (!transaction.description || !transaction.date || !transaction.category || !["receita", "despesa"].includes(transaction.type)) {
    throw new Error("Dados inválidos.");
  }

  if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
    throw new Error("O valor deve ser maior que zero.");
  }

  const transactions = readTransactions();
  transactions.push(transaction);
  writeTransactions(transactions);
  window.dispatchEvent(new CustomEvent("financeflow:updated"));
  return transaction;
}

function removeTransaction(id) {
  const transactions = readTransactions().filter(item => item.id !== id);
  writeTransactions(transactions);
  window.dispatchEvent(new CustomEvent("financeflow:updated"));
}

function initDashboardPage() {
  const monthSelect = document.getElementById("filterMonth");
  const yearSelect = document.getElementById("filterYear");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  const exportBtn = document.getElementById("exportCsvBtn");
  const clearBtn = document.getElementById("clearAllBtn");

  const render = () => {
    const allTransactions = readTransactions();
    populateYearSelect(yearSelect, yearSelect?.value || "");
    const filtered = filterTransactions(allTransactions, monthSelect?.value || "", yearSelect?.value || "");
    renderSummaryCards(filtered);
    renderTable("transactionsTableBody", "emptyState", filtered, { showDelete: false });
    renderExpenseCategoryChart(filtered);
    renderBalanceLineChart(filtered);
    renderMonthlyComparisonChart(allTransactions);
  };

  monthSelect?.addEventListener("change", render);
  yearSelect?.addEventListener("change", render);
  resetFiltersBtn?.addEventListener("click", () => {
    if (monthSelect) monthSelect.value = "";
    if (yearSelect) yearSelect.value = "";
    render();
  });
  exportBtn?.addEventListener("click", exportCSV);
  clearBtn?.addEventListener("click", clearAll);
  window.addEventListener("financeflow:updated", render);

  render();
}

function initLancamentosPage() {
  const form = document.getElementById("transactionForm");
  const typeInput = document.getElementById("type");
  const categoryInput = document.getElementById("category");
  const dateInput = document.getElementById("date");
  const successBanner = document.getElementById("successBanner");
  const exportBtn = document.getElementById("exportCsvBtn");
  const clearBtn = document.getElementById("clearAllBtn");
  const monthSelect = document.getElementById("filterMonth");
  const yearSelect = document.getElementById("filterYear");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");

  const render = () => {
    const allTransactions = readTransactions();
    populateYearSelect(yearSelect, yearSelect?.value || "");
    const filtered = filterTransactions(allTransactions, monthSelect?.value || "", yearSelect?.value || "");
    renderSummaryCards(filtered);
    renderTable("transactionsTableBody", "emptyState", filtered, { showDelete: true });
  };

  typeInput?.addEventListener("change", () => updateCategoryOptions(typeInput, categoryInput));
  updateCategoryOptions(typeInput, categoryInput, false);
  if (dateInput) dateInput.value = todayString();

  form?.addEventListener("submit", event => {
    event.preventDefault();

    try {
      addTransaction({
        description: document.getElementById("description")?.value || "",
        amount: document.getElementById("amount")?.value || 0,
        date: dateInput?.value || "",
        type: typeInput?.value || "receita",
        category: categoryInput?.value || ""
      });

      form.reset();
      if (typeInput) typeInput.value = "receita";
      updateCategoryOptions(typeInput, categoryInput, false);
      if (dateInput) dateInput.value = todayString();
      if (successBanner) {
        successBanner.textContent = "Lançamento salvo com sucesso. A aba principal já foi atualizada.";
        successBanner.classList.add("show");
        setTimeout(() => successBanner.classList.remove("show"), 2400);
      }
      render();
    } catch (error) {
      alert(error.message || "Não foi possível salvar o lançamento.");
    }
  });

  document.getElementById("transactionsTableBody")?.addEventListener("click", event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches("[data-delete-id]")) {
      removeTransaction(target.getAttribute("data-delete-id"));
    }
  });

  monthSelect?.addEventListener("change", render);
  yearSelect?.addEventListener("change", render);
  resetFiltersBtn?.addEventListener("click", () => {
    if (monthSelect) monthSelect.value = "";
    if (yearSelect) yearSelect.value = "";
    render();
  });
  exportBtn?.addEventListener("click", exportCSV);
  clearBtn?.addEventListener("click", clearAll);
  window.addEventListener("financeflow:updated", render);

  render();
}

window.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "dashboard") initDashboardPage();
  if (page === "lancamentos") initLancamentosPage();
});
