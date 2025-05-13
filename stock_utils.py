import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64
import os
import akshare as ak
import pandas as pd
import numpy as np
from datetime import datetime
import logging
import glob

# 配置日志
logging.basicConfig(level=logging.INFO)

BASE_DIR = os.path.dirname(__file__)
SAVE_DIRECTORY = os.path.join(BASE_DIR, 'financial_reports')  # 更新为项目相对路径
stock_dict_a = np.load(os.path.join(BASE_DIR, 'stock_dict_a.npy'), allow_pickle=True).item()

def check_financial_directory():
    if not os.path.exists(SAVE_DIRECTORY):
        logging.error(f"财务报表文件夹不存在: {SAVE_DIRECTORY}")
        raise FileNotFoundError(f"财务报表文件夹不存在: {SAVE_DIRECTORY}")

def fetch_stock_data(symbol, start_date, end_date):
    stock_name = stock_dict_a.get(symbol, '未知证券')
    logging.info(f"获取股票名称: {stock_name}")
    df = ak.stock_zh_a_hist(symbol=symbol, period='daily', start_date=start_date, end_date=end_date, adjust='')
    logging.info(f"获取股票数据: {df.shape}")

    return df, stock_name

def process_stock_data(df, sort_column, sort_order):
    max_market_cap = df.loc[df['市值（亿）'].idxmax(), ['日期', '市值（亿）']].to_dict()
    min_market_cap = df.loc[df['市值（亿）'].idxmin(), ['日期', '市值（亿）']].to_dict()
    ascending = sort_order == 'asc'
    top_50 = df.sort_values(by=sort_column, ascending=ascending).head(50)
    select_columns = top_50[['日期', '开盘', '收盘', '最高', '最低', '涨跌幅', '成交量', '换手率', '市值（亿）']].sort_values(by='日期', ascending=True)

    return max_market_cap, min_market_cap, select_columns

def fetch_stock_info(symbol):
    stock_df = ak.stock_individual_info_em(symbol=symbol)
    needed_items = ['总股本', '流通股', '总市值']
    filtered_df = stock_df[stock_df['item'].isin(needed_items)]
    filtered_df = filtered_df.copy()
    filtered_df['value'] = filtered_df['value'] / 100000000
    filtered_dict = dict(zip(filtered_df['item'], filtered_df['value']))
    current_price = filtered_dict['总市值'] / filtered_dict['总股本']

    return filtered_dict, current_price

def fetch_financial_report(stock_code):
    file_names = [os.path.join(SAVE_DIRECTORY, f"业绩报表_{year}1231.csv") for year in range(2019, 2025)]
    results = []
    for file_name in file_names:
        if os.path.exists(file_name):
            try:
                df = pd.read_csv(file_name, encoding="utf_8_sig", dtype={'股票代码': str})
                if "股票代码" in df.columns:
                    df["股票代码"] = df["股票代码"].astype(str).str.strip()
                    stock_data = df[df["股票代码"] == stock_code]
                    if not stock_data.empty:
                        date_part = os.path.basename(file_name).split("_")[1].split(".")[0]
                        stock_data = stock_data.assign(报告期=date_part)
                        results.append(stock_data)
            except Exception as e:
                logging.error(f"读取文件 {file_name} 出错: {str(e)}")
                raise Exception(f"读取文件 {file_name} 出错: {str(e)}")
        else:
            logging.warning(f"文件 {file_name} 不存在")
    if not results:
        raise Exception(f"未找到股票代码 {stock_code} 的业绩数据")
    # 合并所有年份的数据
    perf_df = pd.concat(results, ignore_index=True)
    selected_columns = ['报告期', '营业总收入-营业总收入', '净利润-净利润', '每股收益', '每股净资产', '每股经营现金流量', '销售毛利率', '净资产收益率']
    available_columns = [col for col in selected_columns if col in perf_df.columns]
    data = perf_df[available_columns].to_dict(orient='records')

    return available_columns, data

def generate_turnover_histogram(df, stock_name):
    try:
        plt.switch_backend('Agg')
        # 提取换手率并去除非正值
        turnover = df["换手率"].dropna()
        turnover = turnover[turnover > 0]
        if turnover.empty:
            logging.warning(f"股票 {stock_name} 无有效换手率数据")
            return None

        # 计算对数换手率
        log_turnover = np.log(turnover)
        mu = log_turnover.mean()
        sigma = log_turnover.std()
        std_lines = [mu - 2*sigma, mu - sigma, mu, mu + sigma, mu + 2*sigma]
        real_turnover_values = np.exp(std_lines).round(2)

        # 设置中文字体
        plt.rcParams['font.sans-serif'] = ['SimHei']
        plt.rcParams['axes.unicode_minus'] = False

        # 绘图
        plt.figure(figsize=(12, 6))
        plt.hist(log_turnover, bins=30, density=False, alpha=0.7, color='skyblue', edgecolor='black')
        for i, (x, r) in enumerate(zip(std_lines, real_turnover_values)):
            plt.axvline(x=x, color='green', linestyle='--', linewidth=1)
            label = f"ln(x)={x:.2f}\n换手率≈{r:.2f}%"
            plt.text(x, plt.ylim()[1]*0.8, label, rotation=90, verticalalignment='top', color='green', fontsize=9)
        plt.title(f"{stock_name} 对数换手率的频数直方图", fontsize=14)
        plt.xlabel("对数换手率 ln(换手率)", fontsize=12)
        plt.ylabel("出现次数", fontsize=12)
        plt.grid(True)
        plt.tight_layout()

        # 将图表保存到内存并转换为 Base64
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        plt.close()  # 关闭图表以释放内存
        return image_base64
    except Exception as e:
        logging.error(f"生成直方图失败: {str(e)}")
        return None

def filter_stocks(roe, gross_margin, net_profit):
    try:
        # 获取所有业绩报表文件
        file_names = glob.glob(os.path.join(SAVE_DIRECTORY, '业绩报表_*.csv'))
        if not file_names:
            logging.error(f"未找到业绩报表文件: {SAVE_DIRECTORY}")
            raise FileNotFoundError(f"未找到业绩报表文件: {SAVE_DIRECTORY}")

        # 按文件名排序，确保最新年份的在最后
        file_names.sort()
        latest_report = file_names[-1]  # 获取最新年报文件

        filtered_sets = []
        common_codes  = None

        for file_name in file_names:
            df = pd.read_csv(file_name, encoding='utf-8-sig', dtype={'股票代码': str})
            filtered_df = df[
                (df['净资产收益率'] >= roe) &
                (df['销售毛利率'] >= gross_margin) &
                (df['净利润-净利润'] > net_profit)
                ]
            filtered_sets.append(filtered_df)  # 将筛选结果添加到列表中
            # 获取当前文件的股票代码集合
            current_codes = set(filtered_df['股票代码'])

            # 更新共同股票代码集合
            if common_codes is None:
                common_codes = current_codes
            else:
                common_codes = common_codes.intersection(current_codes)

        if not common_codes:
            logging.warning("没有股票满足筛选条件")
            return {'columns': [], 'data': []}

        latest_df = pd.read_csv(latest_report, encoding="utf-8-sig", dtype={"股票代码":str})
        final_results = latest_df[latest_df['股票代码'].isin(common_codes)]
        selected_columns = ['股票代码', '股票简称', '每股收益', '营业总收入-营业总收入','净利润-净利润','每股净资产', '净资产收益率', '每股经营现金流量', '销售毛利率', '所处行业']
        final_results = final_results[selected_columns]
        # 清理数据
        final_results = final_results.replace([np.nan, pd.NA], None)

        return final_results
    except Exception as e:
        logging.error(f"筛选股票失败: {str(e)}")
        raise Exception(f"筛选股票失败: {str(e)}")

