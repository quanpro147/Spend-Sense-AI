import pytest
from unittest.mock import patch
from src.core.stress_tester import (
    calculate_diversification_score,
    run_portfolio_stress_test,
)


def test_diversification_score_single_asset():
    # If all value is in a single asset type, score should be 0
    weights = {"stock": 100.0, "gold": 0.0, "saving": 0.0, "crypto": 0.0, "cash": 0.0}
    score = calculate_diversification_score(weights)
    assert score == 0.0


def test_diversification_score_even_distribution():
    # If evenly distributed across 4 categories, it should approach 100
    weights = {"stock": 25.0, "gold": 25.0, "saving": 25.0, "crypto": 25.0, "cash": 0.0}
    score = calculate_diversification_score(weights)
    # diversity = 1 - (4 * 0.0625) = 0.75
    # score = (0.75 / 0.75) * 100 = 100
    assert abs(score - 100.0) < 0.01


def test_portfolio_stress_test_calculation():
    # Mock user profile
    profile = {
        "capital": 100000000.0,  # 100M VND
        "risk_appetite": "moderate",
        "goal": "Mua nhà"
    }
    
    # Mock assets: 30M in FPT stock, 20M in GOLD SJC, 10M in BTC, leaving 40M cash
    assets = [
        {
            "id": "asset-1",
            "symbol": "FPT",
            "name": "Cổ phiếu FPT",
            "type": "stock",
            "quantity": 300.0,
            "purchase_price": 100000.0,  # 30M VND invested
            "color": "#5BAAEC"
        },
        {
            "id": "asset-2",
            "symbol": "GOLD",
            "name": "Vàng SJC",
            "type": "gold",
            "quantity": 0.25,
            "purchase_price": 80000000.0,  # 20M VND invested
            "color": "#F59E0B"
        },
        {
            "id": "asset-3",
            "symbol": "BTC",
            "name": "Bitcoin",
            "type": "crypto",
            "quantity": 0.01,
            "purchase_price": 1000000000.0,  # 10M VND invested
            "color": "#FB923C"
        }
    ]
    
    # Mock current prices (no changes for now)
    current_prices = {
        "FPT": 100000.0,
        "GOLD": 80000000.0,
        "BTC": 1000000000.0
    }
    
    # Run the test, patching Gemini API to avoid live call
    with patch("src.core.stress_tester._call_gemini") as mock_gemini:
        # Mock Gemini returning valid JSON
        mock_gemini.return_value = '{"overall_analysis": "Danh mục an toàn.", "hedging_strategies": []}'
        
        result = run_portfolio_stress_test(profile, assets, current_prices)
        
        # Verify basic fields
        assert result["total_capital"] == 100000000.0
        assert result["portfolio_value"] == 60000000.0
        assert result["idle_cash"] == 40000000.0
        assert len(result["scenarios"]) == 4
        assert result["vulnerability_score"] >= 0.0
        assert result["diversification_score"] > 0.0
        assert result["overall_analysis"] == "Danh mục an toàn."
        assert len(result["hedging_strategies"]) == 0
