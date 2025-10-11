#!/usr/bin/env python3
"""
Additional edge case tests for Solana Multi-Send API
"""

import requests
import json

BASE_URL = "https://solana-pay-hub.preview.emergentagent.com/api"
VALID_ADDRESS = "3ALfiR1TK2JqC18nfCE8vhGqBD86obX8AcV4YgjzmRij"

def test_large_recipient_list():
    """Test with maximum recipients (1000)"""
    print("Testing large recipient list (1000 recipients)...")
    
    recipients = []
    for i in range(1000):
        recipients.append({
            "wallet_address": VALID_ADDRESS,
            "amount": 0.001
        })
    
    request_data = {
        "token_mint": "SOL",
        "sender_wallet": VALID_ADDRESS,
        "recipients": recipients
    }
    
    try:
        response = requests.post(f"{BASE_URL}/estimate-fees", json=request_data)
        if response.status_code == 200:
            data = response.json()
            expected_batches = 84  # ceil(1000/12) = 84 batches + 1 dev fee = 85 transactions
            print(f"✅ Large list test PASSED: {data['transaction_count']} transactions for 1000 recipients")
            return True
        else:
            print(f"❌ Large list test FAILED: Status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Large list test FAILED: {str(e)}")
        return False

def test_different_tokens():
    """Test fee estimation with different tokens"""
    print("Testing different token types...")
    
    tokens = ["SOL", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]
    
    for token in tokens:
        request_data = {
            "token_mint": token,
            "sender_wallet": VALID_ADDRESS,
            "recipients": [
                {"wallet_address": VALID_ADDRESS, "amount": 10.0}
            ]
        }
        
        try:
            response = requests.post(f"{BASE_URL}/estimate-fees", json=request_data)
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Token {token[:10]}... test PASSED: Dev fee = {data['developer_fee']}")
            else:
                print(f"❌ Token {token} test FAILED: Status {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Token {token} test FAILED: {str(e)}")
            return False
    
    return True

def test_developer_fee_calculation():
    """Test precise developer fee calculation"""
    print("Testing developer fee precision...")
    
    test_amounts = [100.0, 1000.0, 0.1, 999.999]
    
    for amount in test_amounts:
        request_data = {
            "token_mint": "SOL",
            "sender_wallet": VALID_ADDRESS,
            "recipients": [
                {"wallet_address": VALID_ADDRESS, "amount": amount}
            ]
        }
        
        try:
            response = requests.post(f"{BASE_URL}/estimate-fees", json=request_data)
            if response.status_code == 200:
                data = response.json()
                expected_fee = round(amount * 0.001, 9)
                actual_fee = data['developer_fee']
                
                if abs(actual_fee - expected_fee) < 0.000000001:
                    print(f"✅ Fee calculation for {amount}: {actual_fee} (expected: {expected_fee})")
                else:
                    print(f"❌ Fee calculation FAILED for {amount}: got {actual_fee}, expected {expected_fee}")
                    return False
            else:
                print(f"❌ Fee calculation test FAILED: Status {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Fee calculation test FAILED: {str(e)}")
            return False
    
    return True

def test_csv_edge_cases():
    """Test CSV parsing edge cases"""
    print("Testing CSV edge cases...")
    
    # Test CSV with extra columns
    csv_content = f"wallet_address,amount,extra_column\n{VALID_ADDRESS},1.5,ignored\n{VALID_ADDRESS},2.0,also_ignored"
    
    try:
        files = {'file': ('test_extra_cols.csv', csv_content, 'text/csv')}
        response = requests.post(f"{BASE_URL}/parse-csv", files=files)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("count") == 2:
                print("✅ CSV with extra columns PASSED")
                return True
            else:
                print(f"❌ CSV extra columns FAILED: {data}")
                return False
        else:
            print(f"❌ CSV extra columns FAILED: Status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ CSV extra columns FAILED: {str(e)}")
        return False

def run_additional_tests():
    """Run all additional tests"""
    print("Running additional edge case tests...")
    
    results = []
    results.append(test_large_recipient_list())
    results.append(test_different_tokens())
    results.append(test_developer_fee_calculation())
    results.append(test_csv_edge_cases())
    
    passed = sum(results)
    total = len(results)
    
    print(f"\nAdditional Tests Summary: {passed}/{total} passed")
    return all(results)

if __name__ == "__main__":
    success = run_additional_tests()
    exit(0 if success else 1)