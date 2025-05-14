// =====================
// 📦 工具函数
// =====================
function formatNumber(value) {
    if (value == null || isNaN(value)) return value || '';
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'text-red-500 mt-2';
    errorDiv.textContent = message;
    document.querySelector('.container').prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return await res.json();
}

function getValue(id) {
    return document.getElementById(id).value.trim();
}

function getNumeric(id, multiplier = 1) {
    const val = parseFloat(getValue(id));
    return isNaN(val) ? null : val * multiplier;
}


// =====================
// 📊 股票数据处理
// =====================
let originalData = [], currentSort = { column: null, order: null };
let lastStockCode = null, cachedFinancialData = null;

async function fetchStockData() {
    const stockCode = getValue('stockCode');
    const startDate = getValue('startDate');
    const endDate = getValue('endDate');
    const sortColumn = getValue('sortColumn');
    const sortOrder = getValue('sortOrder');

    if (!stockCode) return showError('请输入证券代码。');
    if (!startDate || !endDate) return showError('请输入起始和结束日期');

    try {
        const data = await fetchJson(`/get_stock_data?symbol=${stockCode}&start_date=${startDate}&end_date=${endDate}&sort_column=${sortColumn}&sort_order=${sortOrder}`);

        if (data.error) return showError(data.error);
        originalData = data.table;

        document.getElementById('stockName').innerHTML = `<p><strong>股票名称:<span class="text-red-500">${data.stock_name}</span></strong></p>`;
        document.getElementById('dataInfo').innerHTML = `<p><strong>交易日:<span class="text-red-500">${data.shape[0]}</span>天</strong></p>`;
        document.getElementById('marketCapInfo').innerHTML = `
            <p><strong>最高市值:</strong><span class="text-red-500"> ${data.max_market_cap['市值（亿）']}</span> 亿 (日期: ${data.max_market_cap['日期']})</p>
            <p><strong>最低市值:</strong><span class="text-green-500"> ${data.min_market_cap['市值（亿）']}</span> 亿 (日期: ${data.min_market_cap['日期']})</p>
        `;
        document.getElementById('tableTitle').textContent = `${startDate} 至 ${endDate} ${sortColumn} 交易数据`;

        if (data.histogram_image) {
            document.getElementById('histogramImage').src = `data:image/png;base64,${data.histogram_image}`;
            document.getElementById('histogramContainer').classList.remove('hidden');
        } else {
            document.getElementById('histogramContainer').classList.add('hidden');
        }

        applyFilters();
        document.getElementById('stockTable').classList.remove('hidden');

    } catch (err) {
        console.error('获取数据失败:', err);
        showError('获取数据失败: ' + err.message);
    }
}

async function fetchFinancialRep() {
    const stockCode = getValue('stockInfoCode');
    try{
        const data = await fetchJson(`/get_financial_report?symbol=${stockCode}`);
         if (data.error) {
            showError(data.error);
            return;
        }
        
        renderFinancialTable(data)
    }catch (err) {
        console.error('获取数据失败:', err);
        showError('获取数据失败: ' + err.message)    
    }
}

async function fetchStockInfo(){
    const stockCode = getValue('stockInfoCode');
    if (!stockCode) return showError('请输入证券代码。');

    try{
        const data = await fetchJson(`/get_stock_info?symbol=${stockCode}`);
        if (data.error) return showError(data.error);

        // 更新金融信息显示
        document.getElementById('stockAbbre').textContent = formatNumber(data.stock_info_dict['股票简称']);
        document.getElementById('industry').textContent = formatNumber(data.stock_info_dict['行业']);
        document.getElementById('totalShares').textContent = formatNumber(data.stock_info_dict['总股本']) + '亿';
        document.getElementById('floatShares').textContent = formatNumber(data.stock_info_dict['流通股']) + '亿';
        document.getElementById('marketCap').textContent = formatNumber(data.stock_info_dict['总市值']) + '亿';
        document.getElementById('currentPrice').textContent = formatNumber(data.stock_info_dict['现价']) + '元';
        // 显示金融信息区域
        document.getElementById('stockInfoDict').classList.remove('hidden');

    }catch (err) {
        console.error('获取数据失败:', err);
        showError('获取数据失败: ' + err.message);
    }
    }


function applyFilters() {
    const data = [...originalData];
    if (currentSort.column) {
        data.sort((a, b) => {
            const aVal = currentSort.column === '日期' ? new Date(a[currentSort.column]) : parseFloat(a[currentSort.column]) || 0;
            const bVal = currentSort.column === '日期' ? new Date(b[currentSort.column]) : parseFloat(b[currentSort.column]) || 0;
            return currentSort.order === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }
    renderTable(data);
}

function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = data.map(row => `
        <tr>
            <td class="p-2 border">${row['日期']}</td>
            <td class="p-2 border">${row['开盘']}</td>
            <td class="p-2 border">${row['收盘']}</td>
            <td class="p-2 border">${row['最高']}</td>
            <td class="p-2 border">${row['最低']}</td>
            <td class="p-2 border">${row['涨跌幅']}</td>
            <td class="p-2 border">${formatNumber(row['成交量'])}</td>
            <td class="p-2 border">${row['换手率']}</td>
            <td class="p-2 border">${formatNumber(row['市值（亿）'])}</td>
        </tr>
    `).join('');
}

function renderFinancialTable(data) {
     if (data.error) {
        showError(data.error);
        return;
    }
    if (!data.table || !data.table.length) {
        document.getElementById('financialContainer').classList.add('hidden');
        return;
    }

    const numeric = ['营业总收入-营业总收入', '净利润-净利润', '每股收益', '每股净资产', '每股经营现金流量', '销售毛利率', '净资产收益率'];
    const headerRow = document.getElementById('financialHeader');
    const body = document.getElementById('financialBody');

    document.getElementById('stockAbbr').textContent = `${data.stock_abbr} 财务数据摘要:`

    headerRow.innerHTML = data.columns.map(col => `<th class="p-2 border">${col}</th>`).join('');
    body.innerHTML = data.table.map(row => `
        <tr>
            ${data.columns.map(col => `<td class="p-2 border text-center">${numeric.includes(col) ? formatNumber(row[col]) : (row[col] ?? '')}</td>`).join('')}
        </tr>
    `).join('');

    document.getElementById('financialContainer').classList.remove('hidden');
}


// =====================
// 🧮 筛选处理
// =====================
async function filterStocks() {
    const roe = getNumeric('roe');
    const gross = getNumeric('grossMargin');
    const profit = getNumeric('netProfit', 1e8);

    if ([roe, gross, profit].some(v => v === null)) return showError('请输入有效的筛选条件');

    try {
        const data = await fetchJson('/get_filtered_stocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roe, gross_margin: gross, net_profit: profit })
        });

        if (!data.columns || !Array.isArray(data.data)) throw new Error('无效的响应数据格式');

        document.getElementById('resultsAmount').innerHTML = `<p><strong>符合条件的股票数量:<span class="text-red-500">${data.results_amount[0]}</span> 只</strong></p>`;

        document.getElementById('filterResultHeader').innerHTML = data.columns.map(col => `<th class="p-2 border">${col}</th>`).join('');

        const numericCols = [
            '每股收益', '营业总收入-营业总收入', '营业总收入-同比增长', '营业总收入-季度环比增长',
            '净利润-净利润', '净利润-同比增长', '净利润-季度环比增长', '每股净资产',
            '净资产收益率', '每股经营现金流量', '销售毛利率'
        ];

        document.getElementById('filterResultBody').innerHTML = data.data.map(row => `
            <tr>
                ${data.columns.map(col => `<td class="p-2 border">${numericCols.includes(col) ? formatNumber(row[col]) : (row[col] ?? '-')}</td>`).join('')}
            </tr>
        `).join('');

        document.getElementById('filterResultContainer').classList.remove('hidden');

    } catch (err) {
        console.error('筛选失败:', err);
        showError('筛选请求失败: ' + err.message);
    }
}


// =====================
// 🔁 初始化事件
// =====================
function initEventListeners() {
    document.getElementById('fetchData').addEventListener('click', fetchStockData);
    document.getElementById('filterStocks').addEventListener('click', filterStocks);
    document.getElementById('stockInfo').addEventListener('click', fetchStockInfo);
    document.getElementById('stockInfo').addEventListener('click', fetchFinancialRep);
    document.getElementById('stockCode').addEventListener('keydown', e => {
        if (e.key === 'Enter') fetchStockData();
    });

    document.getElementById('filterForm').addEventListener('submit', e => {
        e.preventDefault();
        // 获取触发提交的按钮
        const submitter = e.submitter;
        
        if (submitter.id === 'filterStocks') {
            filterStocks(); // 执行股票筛选函数
        } 
    });

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentSort = {
                column: btn.getAttribute('data-column'),
                order: btn.getAttribute('data-order')
            };
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFilters();
        });
    });
}

document.addEventListener('DOMContentLoaded', initEventListeners);
