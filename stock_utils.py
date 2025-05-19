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
    df['市值（亿）'] = np.where(df['换手率'] > 0, (df['成交额'] / df['换手率'] / 1000000).round(2), np.nan)
    df['日期'] = pd.to_datetime(df['日期']).dt.strftime('%Y/%m/%d')
    logging.info(f"获取股票数据: {df.shape}")

    return df, stock_name

def process_stock_data(df, sort_column, sort_order):
    max_market_cap = df.loc[df['市值（亿）'].idxmax(), ['日期', '市值（亿）']].to_dict()
    min_market_cap = df.loc[df['市值（亿）'].idxmin(), ['日期', '市值（亿）']].to_dict()
    ascending = sort_order == 'asc'
    top_50 = df.sort_values(by=sort_column, ascending=ascending).head(50)
    select_top50 = top_50[['日期', '开盘', '收盘', '最高', '最低', '涨跌幅', '成交量', '换手率', '市值（亿）']].sort_values(by='日期', ascending=True)

    return max_market_cap, min_market_cap, select_top50

def fetch_stock_info(symbol):
    stock_df = ak.stock_individual_info_em(symbol=symbol)
    stock_info_dict = dict(zip(stock_df['item'],stock_df['value']))
    current_price = stock_info_dict['总市值'] / stock_info_dict['总股本']
    numeric_items = ['总股本', '流通股', '总市值', '流通市值']
    for item in numeric_items:
        if item in stock_info_dict:
            stock_info_dict[item] = float(stock_info_dict[item]) / 100000000
    stock_info_dict['现价'] = current_price

    return stock_info_dict

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
    stock_abbr = perf_df['股票简称'][0]
    selected_columns = ['报告期', '营业总收入-营业总收入', '净利润-净利润', '每股收益', '每股净资产', '每股经营现金流量', '销售毛利率', '净资产收益率']
    available_columns = [col for col in selected_columns if col in perf_df.columns]
    data = perf_df[available_columns].to_dict(orient='records')

    return stock_abbr, available_columns, data

def process_log_turnover(df, stock_name):
    """
    处理换手率数据并返回对数化结果及统计数据
    """
    try:
        turnover = df["换手率"].dropna()
        turnover = turnover[turnover > 0]
        if turnover.empty:
            logging.warning(f"股票 {stock_name} 无有效换手率数据")
            return None, None, None, pd.DataFrame(), pd.DataFrame()
        log_turnover = np.log(turnover)
        mu = log_turnover.mean()
        sigma = log_turnover.std()
        std_lines = [mu - 2*sigma, mu - sigma, mu, mu + sigma, mu + 2*sigma]
        real_turnover_values = np.exp(std_lines).round(2)
        # 计算低于和高于 2 倍标准差的数据
        threshold_blow = np.exp(mu - 2*sigma)
        threshold_above = np.exp(mu + 2*sigma)
        turnover_blow_2sigma = df[df["换手率"] < threshold_blow]
        turnover_above_2sigma = df[df["换手率"] > threshold_above]

        return log_turnover, std_lines, real_turnover_values, turnover_blow_2sigma, turnover_above_2sigma
    
    except Exception as e:
        logging.error(f"处理换手率数据失败: {str(e)}")
        return None, None, None, pd.DataFrame(), pd.DataFrame()
    
def plot_histogram(log_turnover, std_lines, real_turnover_values, stock_name):
    """
    根据对数换手率数据生成直方图
    """
    try:
        if log_turnover is None or std_lines is None or real_turnover_values is None:
            logging.warning(f"无法生成 {stock_name} 的直方图：无效输入数据")
            return None
        plt.rcParams['font.sans-serif'] = ['SimHei']
        plt.rcParams['axes.unicode_minus'] = False
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
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        plt.close()
        return image_base64
    
    except Exception as e:
        logging.error(f"生成直方图失败: {str(e)}")
        return None

def filter_stocks(years ,roe, gross_margin, net_profit, income_growth,net_pro_growth):
    try:
        # 获取所有业绩报表文件
        file_names = glob.glob(os.path.join(SAVE_DIRECTORY, '业绩报表_*.csv'))
        if not file_names:
            logging.error(f"未找到业绩报表文件: {SAVE_DIRECTORY}")
            raise FileNotFoundError(f"未找到业绩报表文件: {SAVE_DIRECTORY}")
        # 按文件名排序，确保最新年份的在最后
        file_names.sort()
        if years > len(file_names):
            print(f"警告：仅找到 {len(file_names)} 个文件，少于请求的 {years} 个。")
            recent_years_files = file_names
        else:
            recent_years_files = file_names[-years:]  # 取最后n个文件
        latest_report = file_names[-1]  # 获取最新年报文件

        filtered_sets = []
        common_codes  = None

        for file_name in recent_years_files:
            df = pd.read_csv(file_name, encoding='utf-8-sig', dtype={'股票代码': str})
            filtered_df = df[
                (df['净资产收益率'] >= roe) &
                (df['销售毛利率'] >= gross_margin) &
                (df['净利润-净利润'] >= net_profit) &
                (df['营业总收入-同比增长'] >= income_growth) &
                (df['净利润-同比增长'] >= net_pro_growth)
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
        final_results = final_results.replace([np.nan, pd.NA], None)
        return final_results
    
    except Exception as e:
        logging.error(f"筛选股票失败: {str(e)}")
        raise Exception(f"筛选股票失败: {str(e)}")

