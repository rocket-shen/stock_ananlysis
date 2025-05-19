from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import pandas as pd
import os
import webbrowser
from stock_utils import (
    check_financial_directory,
    fetch_stock_data,
    process_stock_data,
    fetch_financial_report,
    process_log_turnover,
    plot_histogram,
    filter_stocks,
    fetch_stock_info
)

app = Flask(__name__)
CORS(app, resources={r"/get_*": {"origins": ["http://localhost:5000"]}})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/histogram')
def histogram():
    return render_template('histogram.html')

@app.route('/get_stock_data')
def get_stock_data():
    try:
        symbol = request.args.get('symbol').strip()
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        sort_column = request.args.get('sort_column', '换手率')
        sort_order = request.args.get('sort_order', 'desc')

        app.logger.info(f"处理请求: symbol={symbol}, start_date={start_date}, end_date={end_date}")

        if not symbol:
            return jsonify({'error': '股票代码不能为空'}), 400
        if not start_date or not end_date:
            return jsonify({'error': '起始日期和结束日期不能为空'}), 400
        if not (start_date.isdigit() and end_date.isdigit() and len(start_date) == 8 and len(end_date) == 8):
            return jsonify({'error': '日期格式错误，请使用 YYYYMMDD 格式'}), 400

        df, stock_name = fetch_stock_data(symbol, start_date, end_date)
        max_market_cap, min_market_cap, select_top50 = process_stock_data(df, sort_column, sort_order)
        log_turnover, std_lines, real_turnover_values, turnover_blow_2sigma, turnover_above_2sigma = process_log_turnover(df, stock_name)
        histogram_image = plot_histogram(log_turnover, std_lines, real_turnover_values, stock_name)

        response = {
            'shape': list(df.shape),
            'table': select_top50.to_dict(orient='records'),
            'stock_name': stock_name,
            'max_market_cap': max_market_cap,
            'min_market_cap': min_market_cap,
            'histogram_image': histogram_image,
            'real_turnover_values': real_turnover_values.tolist() if real_turnover_values is not None else None,
            'df': df.to_dict(orient='records'),
            'turnover_above_2sigma': turnover_above_2sigma.to_dict(orient='records'),
            'turnover_blow_2sigma' : turnover_blow_2sigma.to_dict(orient='records')
        }
        return jsonify(response)
    except Exception as e:
        app.logger.error(f"错误: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/get_stock_info')
def get_stock_info():
    try:
        symbol = request.args.get('symbol').strip()
        if not symbol:
            return jsonify({'error': '股票代码不能为空'}), 400
        stock_info_dict= fetch_stock_info(symbol)

        return jsonify({'stock_info_dict': stock_info_dict})
    except Exception as e:
        app.logger.error(f"错误: {str(e)}")
        return jsonify({'error': str(e)}), 500

# 清除已有端点，防止重复注册
app.view_functions.pop('get_financial_report', None)
@app.route('/get_financial_report')
def get_financial_report():
    stock_code = request.args.get('symbol', '').strip()
    try:
        stock_abbr, available_columns, data = fetch_financial_report(stock_code)
        response = {'stock_abbr':stock_abbr,'table': data, 'columns': available_columns}
        return jsonify(response)
    except Exception as e:
        app.logger.error(f"获取财务报表失败: {str(e)}")
        return jsonify({'error': str(e)}), 404



@app.route('/get_filtered_stocks', methods=['POST'])
def get_filter_stocks():
    try:
        # 获取前端传递的筛选条件
        data = request.get_json()
        years = int(data['years'])
        roe = float(data['roe'])
        gross_margin = float(data['gross_margin'])
        net_profit = float(data['net_profit'])
        income_growth = float(data['income_growth'])
        net_pro_growth = float(data['net_pro_growth'])

        app.logger.info(f"筛选股票: years={years},roe={roe}, gross_margin={gross_margin}, net_profit={net_profit},income_growth={income_growth},net_pro_growth={net_pro_growth}")
        # 调用 filter_stocks 函数
        final_results = filter_stocks(years,roe, gross_margin, net_profit,income_growth,net_pro_growth)
        result = {
            'columns': final_results.columns.tolist(),
            'data': final_results.to_dict('records'),
            'results_amount':list(final_results.shape)
        }

        return jsonify(result)

    except KeyError as e:
        app.logger.error(f"缺少必要参数: {str(e)}")
        return jsonify({'error': f"缺少必要参数: {str(e)}"}), 400
    except ValueError as e:
        app.logger.error(f"参数格式错误: {str(e)}")
        return jsonify({'error': f"参数格式错误: {str(e)}"}), 400
    except Exception as e:
        app.logger.error(f"筛选股票失败: {str(e)}")
        return jsonify({'error': str(e)}), 500

# 在应用启动时调用初始化
check_financial_directory()

if __name__ == '__main__':
    check_financial_directory()
    url = 'http://127.0.0.1:5000'
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        webbrowser.open(url)
    app.run(debug=True, host='0.0.0.0', port=5000)

    