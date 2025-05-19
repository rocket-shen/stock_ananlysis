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
    return document.getElementById(id)?.value.trim() || '';
}

function getNumeric(id, multiplier = 1) {
    const val = parseFloat(getValue(id));
    if (isNaN(val)) return null;
    const result = val * multiplier;
    return id === 'years' ? Math.floor(result) : result; // 对于 years 字段取整
}

// =====================
// 📊 股票数据处理
// =====================
let originalData = [], currentSort = { column: null, order: null };
let lastStockCode = null, cachedFinancialData = null;
let histogramImage = null, realTurnoverValues = null;
let turnOverAbove = null, turnOverBlow = null;


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
        histogramImage = data.histogram_image
        realTurnoverValues = data.real_turnover_values
        turnOverAbove = data.turnover_above_2sigma
        turnOverBlow = data.turnover_blow_2sigma

        document.getElementById('stockName').innerHTML = `<p><strong>股票名称:<span class="text-red-500">${data.stock_name}</span></strong></p>`;
        document.getElementById('dataInfo').innerHTML = `<p><strong>交易日:<span class="text-red-500">${data.shape[0]}</span>天</strong></p>`;
        document.getElementById('marketCapInfo').innerHTML = `
            <p><strong>最高市值:</strong><span class="text-red-500"> ${data.max_market_cap['市值（亿）']}</span> 亿 (日期: ${data.max_market_cap['日期']})</p>
            <p><strong>最低市值:</strong><span class="text-green-500"> ${data.min_market_cap['市值（亿）']}</span> 亿 (日期: ${data.min_market_cap['日期']})</p>
        `;
        document.getElementById('tableTitle').textContent = `${data.stock_name} ${startDate} 至 ${endDate} ${sortColumn} 交易数据`;

        // 显示直方图按钮（无论是否有 histogramImage）
        const showHistogramBtn = document.getElementById('showHistogramBtn');
        if (showHistogramBtn) {
            showHistogramBtn.classList.remove('hidden');
        }

        applyFilters();
        document.getElementById('stockTable').classList.remove('hidden');

    } catch (err) {
        console.error('获取数据失败:', err);
        showError('获取数据失败: ' + err.message);
    }
}



async function fetchFinancialRep() {
    const stockCode = getValue('stockCode');
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
    const stockCode = getValue('stockCode');
    if (!stockCode) return showError('请输入证券代码。');

    try{
        const data = await fetchJson(`/get_stock_info?symbol=${stockCode}`);
        if (data.error) return showError(data.error);

        // 更新金融信息显示
        document.getElementById('stockAbbre').textContent = formatNumber(data.stock_info_dict['股票简称']);
        document.getElementById('totalShares').textContent = formatNumber(data.stock_info_dict['总股本']) + '亿';
        document.getElementById('marketCap').textContent = formatNumber(data.stock_info_dict['总市值']) + '亿';
        document.getElementById('industry').textContent = formatNumber(data.stock_info_dict['行业']);
        document.getElementById('floatShares').textContent = formatNumber(data.stock_info_dict['流通股']) + '亿';
        document.getElementById('currentPrice').textContent = formatNumber(data.stock_info_dict['现价']) + '元';


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

    document.getElementById('stockAbbr').innerHTML = `<span class="text-red-600">${data.stock_abbr}</span> 财务数据摘要:`

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
    const years = getNumeric('years')
    const roe = getNumeric('roe');
    const gross = getNumeric('grossMargin');
    const profit = getNumeric('netProfit', 1e8);
    const income_growth = getNumeric('incomeGrowth');
    const net_pro_growth = getNumeric('netProGrowth');

    if ([years,roe, gross, profit,income_growth,net_pro_growth].some(v => v === null)) return showError('请输入有效的筛选条件');

    try {
        const data = await fetchJson('/get_filtered_stocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({years:years, roe:roe, gross_margin: gross, net_profit: profit, income_growth:income_growth, net_pro_growth:net_pro_growth})
        });

        if (!data.columns || !Array.isArray(data.data)) throw new Error('无效的响应数据格式');

        document.getElementById('resultsAmount').innerHTML = `<p><strong>筛选出符合条件的股票数量:<span class="text-red-500">${data.results_amount[0]}</span> 只</strong></p>`;

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

// 直方图页面专用函数
function showHistogram() {
    if (!histogramImage || !realTurnoverValues || !turnOverAbove || !turnOverBlow) {
        showError('当前无直方图或数据可显示，请先查询股票数据。');
        return;
    }
    sessionStorage.setItem('histogramImage', histogramImage);
    sessionStorage.setItem('realTurnoverValues', JSON.stringify(realTurnoverValues));
    sessionStorage.setItem('turnOverAbove', JSON.stringify(turnOverAbove));
    sessionStorage.setItem('turnOverBlow', JSON.stringify(turnOverBlow));
    const newWindow = window.open('/histogram','_blank');
    if (!newWindow){
        showError('无法打开新窗口，请检查浏览器是否阻止了弹出窗口')
    }
}

function showHistogramError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'text-red-500 mt-2';
    errorDiv.textContent = message;
    document.querySelector('#errorMessage')?.prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

function initHistogramPage() {
    if (window.location.pathname === '/histogram') {
        const histogramImage = sessionStorage.getItem('histogramImage');
        const realTurnoverValues = JSON.parse(sessionStorage.getItem('realTurnoverValues'));
        turnOverAbove = JSON.parse(sessionStorage.getItem('turnOverAbove')); // 从 sessionStorage 获取
        turnOverBlow = JSON.parse(sessionStorage.getItem('turnOverBlow'));   // 从 sessionStorage 获取
        if (!histogramImage || !realTurnoverValues || !turnOverAbove || !turnOverBlow) {
            showHistogramError('缺少必要数据，请重新查询股票数据。');
            return;
        }

        document.getElementById('histogram').innerHTML = `
            <img src="data:image/png;base64,${histogramImage}" alt="换手率直方图"  class="mx-auto my-2">
        `;
        document.getElementById('filterButtons').innerHTML = `
            <button onclick="filterData('below')" class="px-4 py-2 bg-blue-500 text-white rounded mx-2">换手率 < ${realTurnoverValues[0]}%</button>
            <button onclick="filterData('above')" class="px-4 py-2 bg-blue-500 text-white rounded mx-2">换手率 > ${realTurnoverValues[4]}%</button>
        `;
    }
}

document.addEventListener('DOMContentLoaded', initHistogramPage);


async function filterData(filterType) {
    if (!turnOverAbove || !turnOverBlow) {
        showHistogramError('筛选参数错误：缺少 turnOverAbove 或 turnOverBlow');
        return;
    }
    try {
        const headers = ['日期', '开盘', '收盘', '最高', '最低', '涨跌幅', '成交量', '换手率', '市值（亿）'];
        let filteredData;
        if (filterType === 'below') {
            filteredData = turnOverBlow;
        } else if (filterType === 'above') {
            filteredData = turnOverAbove;
        } else {
            showHistogramError('无效的筛选类型');
            return;
        }

        if (!Array.isArray(filteredData) || filteredData.length === 0) {
            showHistogramError('筛选数据为空');
            return;
        }
        const requiredColumns = headers;
        const isValid = filteredData.every(row => requiredColumns.every(col => col in row));
        if (!isValid) {
            showHistogramError('筛选数据格式不正确');
            return;
        }

        document.getElementById('filteredHeader').innerHTML = headers.map(col => `<th>${col}</th>`).join('');
        document.getElementById('filteredBody').innerHTML = filteredData.map(row => `
            <tr>
                ${headers.map(col => `<td>${formatNumber(row[col]) || '-'}</td>`).join('')}
            </tr>
        `).join('');
    } catch (err) {
        showHistogramError('筛选失败: ' + err.message);
    }
}

// =====================
// 🔁 初始化事件
// =====================
function initEventListeners() {
    if (window.location.pathname==='/histogram'){
        initHistogramPage();
        return;
    }
    // index.html 的事件监听器
    const fetchDataBtn = document.getElementById('fetchData');
    if (fetchDataBtn){
        fetchDataBtn.addEventListener('click', () =>{
            fetchStockData();
            fetchFinancialRep();
            fetchStockInfo();
        })
    }

    const filterStocksBtn = document.getElementById('filterStocks');
    if (filterStocksBtn){
        filterStocksBtn.addEventListener('click',filterStocks);
    }

    const stockCodeInput = document.getElementById('stockCode');
    if (stockCodeInput) {
        stockCodeInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                fetchStockData();
                fetchStockInfo();
                fetchFinancialRep();
            }
        });
    }
    
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', e => {
            e.preventDefault();
            if (e.submitter.id === 'filterStocks') {
                filterStocks();
            }
        });
    }

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

    // 为 showHistogramBtn 添加点击事件
    const showHistogramBtn = document.getElementById('showHistogramBtn');
    if (showHistogramBtn) {
        showHistogramBtn.addEventListener('click', showHistogram);
    }
}

document.addEventListener('DOMContentLoaded', initEventListeners);
