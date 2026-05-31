import json
import uuid
import structlog
from typing import Any
from src.core.config import get_settings
from src.llm.gemini_client import _call_gemini

log = structlog.get_logger()

# Impact matrices for shock scenarios
# Volatility values representing fractional changes (e.g. -0.25 = -25% value change)
SHOCK_IMPACTS = {
    "lạm_phát": {  # High Inflation
        "stock": -0.10,
        "tech_stock": -0.05,
        "gold": 0.25,
        "saving": -0.08,
        "crypto": -0.15,
        "cash": -0.10,
    },
    "sụp_đổ_công_nghệ": {  # Tech Crash
        "stock": -0.05,
        "tech_stock": -0.35,  # Hits Tech Stocks heavily
        "gold": 0.05,
        "saving": 0.02,
        "crypto": -0.20,
        "cash": 0.0,
    },
    "suy_thoái_đóng_băng": {  # Market Recession
        "stock": -0.25,
        "tech_stock": -0.25,
        "gold": 0.15,
        "saving": 0.05,
        "crypto": -0.45,
        "cash": 0.0,
    },
    "khủng_hoảng_tiền_số": {  # Crypto Crash
        "stock": -0.02,
        "tech_stock": -0.02,
        "gold": 0.02,
        "saving": 0.0,
        "crypto": -0.70,
        "cash": 0.0,
    }
}

SCENARIO_NAMES_VI = {
    "lạm_phát": "Lạm Phát Phi Mã (High Inflation)",
    "sụp_đổ_công_nghệ": "Khủng Hoảng Công Nghệ (Tech Sector Crash)",
    "suy_thoái_đóng_băng": "Đóng Băng & Suy Thoái (Market Recession)",
    "khủng_hoảng_tiền_số": "Sụp Đổ Thị Trường Crypto (Crypto Collapse)"
}


def calculate_diversification_score(asset_weights: dict[str, float]) -> float:
    """
    Calculate diversification score (0-100) using Simpson's Index of Diversity.
    If all values are in 1 asset type, score is 0.
    If evenly distributed across stock, gold, saving, crypto, score approaches 100.
    """
    total = sum(asset_weights.values())
    if total == 0:
        return 0.0
        
    sum_sq_weights = 0.0
    for val in asset_weights.values():
        weight = val / total
        sum_sq_weights += weight ** 2
        
    # Simpson Index of Diversity = 1 - sum(p_i^2)
    # Max value for 4 categories: 1 - 4 * (0.25^2) = 0.75
    # Normalizing factor = 1 / 0.75 = 1.3333 to scale to 0-100
    diversity = 1.0 - sum_sq_weights
    score = (diversity / 0.75) * 100.0
    return min(100.0, max(0.0, score))


def run_portfolio_stress_test(
    profile_dict: dict[str, Any],
    assets_list: list[dict[str, Any]],
    current_prices: dict[str, float]
) -> dict[str, Any]:
    """
    Runs the shock simulations on the user portfolio assets and queries Gemini
    for custom advisory details.
    """
    total_capital = float(profile_dict.get("capital") or 0.0)
    risk_appetite = str(profile_dict.get("risk_appetite") or "moderate").lower()
    goal = str(profile_dict.get("goal") or "")
    
    # 1. Calculate current asset values and categorize
    current_value = 0.0
    by_type_value = {"stock": 0.0, "gold": 0.0, "saving": 0.0, "crypto": 0.0}
    
    evaluated_assets = []
    for asset in assets_list:
        symbol = str(asset.get("symbol", "")).upper()
        name = asset.get("name", "")
        asset_type = str(asset.get("type", "stock")).lower()
        qty = float(asset.get("quantity") or 0.0)
        buy_price = float(asset.get("purchase_price") or 0.0)
        color = asset.get("color", "#5BAAEC")
        
        # Get real-time price
        current_price = current_prices.get(symbol, buy_price)
        if current_price == 0.0:
            current_price = buy_price
            
        value = qty * current_price
        invested = qty * buy_price
        profit = value - invested
        profit_pct = (profit / invested * 100) if invested > 0 else 0.0
        
        current_value += value
        
        # Track type value
        if asset_type in by_type_value:
            by_type_value[asset_type] += value
        else:
            by_type_value["stock"] += value  # default to stock
            
        evaluated_assets.append({
            "id": str(asset.get("id", "")),
            "user_id": asset.get("user_id"),
            "symbol": symbol,
            "name": name,
            "type": asset_type,
            "quantity": qty,
            "purchase_price": buy_price,
            "current_price": current_price,
            "value": value,
            "profit": profit,
            "profit_percent": profit_pct,
            "color": color,
            "updated_at": asset.get("updated_at")
        })
        
    idle_cash = max(0.0, total_capital - current_value)
    
    # 2. Run shock simulations
    scenario_results = []
    max_loss = 0.0
    worst_scenario = "N/A"
    
    for sc_id, impacts in SHOCK_IMPACTS.items():
        sim_val = 0.0
        # Apply shocks to assets
        for asset in evaluated_assets:
            a_type = asset["type"]
            sym = asset["symbol"]
            
            # Check if tech stock
            impact_key = "stock"
            if a_type == "stock":
                if sym in ("FPT", "CMG", "CTR", "VGI"):  # Vietnamese tech symbols
                    impact_key = "tech_stock"
                    
            if a_type in impacts or impact_key == "tech_stock":
                factor = impacts.get(impact_key if impact_key == "tech_stock" else a_type, 0.0)
            else:
                factor = impacts.get("stock", 0.0)
                
            sim_val += asset["value"] * (1.0 + factor)
            
        # Apply shock to idle cash (e.g. inflation eats cash)
        cash_factor = impacts.get("cash", 0.0)
        sim_val += idle_cash * (1.0 + cash_factor)
        
        total_simulated = sim_val
        change_val = total_simulated - total_capital
        change_pct = (change_val / total_capital * 100) if total_capital > 0 else 0.0
        
        scenario_results.append({
            "id": sc_id,
            "name": SCENARIO_NAMES_VI[sc_id],
            "simulated_value": total_simulated,
            "loss_value": change_val,
            "loss_percent": change_pct
        })
        
        # Track max loss (negative change_pct is a loss, e.g. -20% is greater loss than -5%)
        if change_pct < max_loss:
            max_loss = change_pct
            worst_scenario = SCENARIO_NAMES_VI[sc_id]
            
    # Vulnerability score: maps the worst case drop percent to a 0-100 scale
    # If max drop is e.g. -35%, vulnerability score is 35
    vulnerability_score = min(100.0, max(0.0, abs(max_loss)))
    
    # Calculate diversification score
    weights = by_type_value.copy()
    weights["cash"] = idle_cash
    div_score = calculate_diversification_score(weights)
    
    # 3. Formulate prompt for Gemini
    portfolio_summary_str = f"Tổng số vốn: {total_capital:,.0f} VND. Tiền nhàn rỗi: {idle_cash:,.0f} VND.\nDanh mục đang nắm giữ:\n"
    for a in evaluated_assets:
        portfolio_summary_str += f"- {a['name']} ({a['symbol']}): Loại {a['type']}, Giá trị {a['value']:,.0f} VND (Tỷ lệ lời/lỗ: {a['profit_percent']:+.2f}%)\n"
        
    shock_summary_str = "Kịch bản giả lập thị trường và kết quả thay đổi danh mục:\n"
    for sc in scenario_results:
        shock_summary_str += f"- {sc['name']}: Giá trị sau giả lập {sc['simulated_value']:,.0f} VND, biến động: {sc['loss_percent']:+.2f}%\n"
        
    prompt = f"""Bạn là một Cố vấn Quản lý Rủi ro Tài chính (Financial Risk & Asset Management Advisor) chuyên nghiệp.
Hãy phân tích kết quả Stress-Test (Giả lập Khủng hoảng) dưới đây cho người dùng có các thông tin sau:

Khẩu vị rủi ro: {risk_appetite} (Phổ biến: conservative - thận trọng, moderate - trung bình, aggressive - tăng trưởng)
Mục tiêu tài chính: {goal}

{portfolio_summary_str}
{shock_summary_str}
Worst-case scenario: {worst_scenario} (Biến động tệ nhất: {max_loss:+.2f}%)
Chỉ số đa dạng hóa danh mục: {div_score:.1f}/100
Chỉ số tổn hại rủi ro (Vulnerability Index): {vulnerability_score:.1f}/100

Hãy trả về phản hồi dưới dạng JSON duy nhất, có cấu trúc:
{{
  "overall_analysis": "<Mô tả chi tiết và sâu sắc về độ an toàn của danh mục, phân tích vì sao nó bị ảnh hưởng nặng nề nhất bởi {worst_scenario} và đánh giá tính đa dạng hóa bằng tiếng Việt>",
  "hedging_strategies": [
    {{
      "asset": "<Tên tài sản đề xuất rebalance hoặc mua thêm, ví dụ: Vàng SJC, Gửi tiết kiệm, Cổ phiếu VNM>",
      "action": "<Hành động đề xuất: Mua thêm, Giảm tỷ trọng, Tái phân bổ>",
      "amount": <Số tiền VND đề xuất phân bổ từ tiền nhàn rỗi hoặc chuyển đổi, ví dụ: 5000000>,
      "reasoning": "<Giải thích chi tiết lý do vì sao hành động này giúp phòng vệ chống lại khủng hoảng tồi tệ nhất ở trên, bằng tiếng Việt>"
    }}
  ]
}}
"""
    
    try:
        raw_json = _call_gemini(prompt, response_schema=_stress_test_response_schema())
        parsed = json.loads(raw_json.strip())
        overall_analysis = parsed.get("overall_analysis", "Phân tích stress-test thành công.")
        hedging_strategies = parsed.get("hedging_strategies", [])
    except Exception as exc:
        log.warning("stress_tester.gemini.failed", error=str(exc))
        overall_analysis = f"Danh mục của bạn có mức rủi ro tổn hại là {vulnerability_score:.1f}%. Kịch bản ảnh hưởng lớn nhất là {worst_scenario} với mức sụt giảm dự kiến {max_loss:+.2f}%. Hãy cân nhắc phân bổ tài sản đa dạng hơn để giảm thiểu ảnh hưởng."
        hedging_strategies = _get_default_hedges(idle_assets=weights, worst_scenario=worst_scenario, idle_cash=idle_cash)
        
    return {
        "portfolio_value": current_value,
        "total_capital": total_capital,
        "idle_cash": idle_cash,
        "vulnerability_score": vulnerability_score,
        "diversification_score": div_score,
        "worst_scenario": worst_scenario,
        "worst_loss_percent": max_loss,
        "scenarios": scenario_results,
        "assets": evaluated_assets,
        "overall_analysis": overall_analysis,
        "hedging_strategies": hedging_strategies
    }


def _stress_test_response_schema() -> dict[str, Any]:
    return {
        "type": "OBJECT",
        "properties": {
            "overall_analysis": {"type": "STRING"},
            "hedging_strategies": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "asset": {"type": "STRING"},
                        "action": {"type": "STRING"},
                        "amount": {"type": "NUMBER"},
                        "reasoning": {"type": "STRING"}
                    },
                    "required": ["asset", "action", "amount", "reasoning"]
                }
            }
        },
        "required": ["overall_analysis", "hedging_strategies"]
    }


def _get_default_hedges(idle_assets: dict, worst_scenario: str, idle_cash: float) -> list[dict]:
    # Provide simple static fallback recommendation
    amount_to_allocate = min(idle_cash, 5000000.0) if idle_cash > 0 else 2000000.0
    return [
        {
            "asset": "Vàng SJC hoặc Gửi tiết kiệm",
            "action": "Tái phân bổ tài sản",
            "amount": amount_to_allocate,
            "reasoning": f"Phòng vệ rủi ro sụt giảm từ kịch bản {worst_scenario} bằng cách tăng tỷ trọng các tài sản an toàn."
        }
    ]
