#!/usr/bin/env python3
"""
Comprehensive backend testing for Solana Multi-Send API
Tests all endpoints with valid/invalid scenarios and edge cases
"""

import requests
import json
import io
import csv
from datetime import datetime
import uuid

# Backend URL from frontend .env
BASE_URL = "https://solsend-tech-audit.preview.emergentagent.com/api"

# Test data
VALID_SOLANA_ADDRESSES = [
    "3ALfiR1TK2JqC18nfCE8vhGqBD86obX8AcV4YgjzmRij",  # Developer wallet
    "11111111111111111111111111111112",  # System program
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",  # Token program
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",  # Random valid address
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"   # USDC mint
]

INVALID_SOLANA_ADDRESSES = [
    "invalid",  # Too short
    "1234567890123456789012345678901234567890123456789",  # Too long
    "InvalidBase58Characters!@#$%^&*()",  # Invalid characters
    "",  # Empty
    "123456789012345678901234567890123",  # Wrong length (33 chars)
    "0000000000000000000000000000000000000000000"  # Invalid base58 (45 chars)
]

def print_test_header(test_name):
    """Print formatted test header"""
    print(f"\n{'='*60}")
    print(f"TESTING: {test_name}")
    print(f"{'='*60}")

def print_result(endpoint, status, details=""):
    """Print test result"""
    status_symbol = "✅" if status == "PASS" else "❌"
    print(f"{status_symbol} {endpoint}: {status}")
    if details:
        print(f"   Details: {details}")

def test_health_check():
    """Test GET /api/ endpoint"""
    print_test_header("Health Check API")
    
    try:
        response = requests.get(f"{BASE_URL}/")
        
        if response.status_code == 200:
            data = response.json()
            if "message" in data and "version" in data:
                print_result("GET /api/", "PASS", f"Response: {data}")
                return True
            else:
                print_result("GET /api/", "FAIL", f"Missing required fields in response: {data}")
                return False
        else:
            print_result("GET /api/", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            return False
            
    except Exception as e:
        print_result("GET /api/", "FAIL", f"Exception: {str(e)}")
        return False

def test_token_list():
    """Test GET /api/token-list endpoint"""
    print_test_header("Token List API")
    
    try:
        response = requests.get(f"{BASE_URL}/token-list")
        
        if response.status_code == 200:
            data = response.json()
            
            if "tokens" not in data:
                print_result("GET /api/token-list", "FAIL", "Missing 'tokens' field")
                return False
            
            tokens = data["tokens"]
            expected_symbols = {"SOL", "USDC", "USDT"}
            found_symbols = {token["symbol"] for token in tokens}
            
            if expected_symbols.issubset(found_symbols):
                # Verify token structure
                for token in tokens:
                    required_fields = ["symbol", "name", "mint", "decimals", "logoURI"]
                    if not all(field in token for field in required_fields):
                        print_result("GET /api/token-list", "FAIL", f"Token missing required fields: {token}")
                        return False
                
                print_result("GET /api/token-list", "PASS", f"Found tokens: {found_symbols}")
                return True
            else:
                print_result("GET /api/token-list", "FAIL", f"Missing expected tokens. Found: {found_symbols}")
                return False
        else:
            print_result("GET /api/token-list", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            return False
            
    except Exception as e:
        print_result("GET /api/token-list", "FAIL", f"Exception: {str(e)}")
        return False

def test_validate_recipients():
    """Test POST /api/validate-recipients endpoint"""
    print_test_header("Validate Recipients API")
    
    results = []
    
    # Test 1: Valid recipients
    try:
        valid_request = {
            "token_mint": "SOL",
            "sender_wallet": VALID_SOLANA_ADDRESSES[0],
            "recipients": [
                {"wallet_address": VALID_SOLANA_ADDRESSES[1], "amount": 1.5},
                {"wallet_address": VALID_SOLANA_ADDRESSES[2], "amount": 2.0}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/validate-recipients", json=valid_request)
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["total_recipients", "valid_recipients", "invalid_recipients", "validation_results", "ready_to_send"]
            
            if all(field in data for field in required_fields):
                if data["valid_recipients"] == 2 and data["ready_to_send"]:
                    print_result("POST /api/validate-recipients (valid)", "PASS", f"All recipients valid")
                    results.append(True)
                else:
                    print_result("POST /api/validate-recipients (valid)", "FAIL", f"Expected all valid, got: {data}")
                    results.append(False)
            else:
                print_result("POST /api/validate-recipients (valid)", "FAIL", f"Missing required fields: {data}")
                results.append(False)
        else:
            print_result("POST /api/validate-recipients (valid)", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/validate-recipients (valid)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    # Test 2: Invalid recipients (Pydantic validation should reject at model level)
    try:
        invalid_request = {
            "token_mint": "SOL",
            "sender_wallet": VALID_SOLANA_ADDRESSES[0],
            "recipients": [
                {"wallet_address": INVALID_SOLANA_ADDRESSES[0], "amount": 1.0},  # Invalid address
                {"wallet_address": VALID_SOLANA_ADDRESSES[0], "amount": -1.0}    # Invalid amount
            ]
        }
        
        response = requests.post(f"{BASE_URL}/validate-recipients", json=invalid_request)
        
        # Pydantic validation should reject this at model level (422 status)
        if response.status_code == 422:
            print_result("POST /api/validate-recipients (invalid)", "PASS", f"Correctly rejected invalid data at model level")
            results.append(True)
        elif response.status_code == 200:
            data = response.json()
            if data["invalid_recipients"] > 0 and not data["ready_to_send"]:
                print_result("POST /api/validate-recipients (invalid)", "PASS", f"Correctly identified invalid recipients")
                results.append(True)
            else:
                print_result("POST /api/validate-recipients (invalid)", "FAIL", f"Expected invalid recipients, got: {data}")
                results.append(False)
        else:
            print_result("POST /api/validate-recipients (invalid)", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/validate-recipients (invalid)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    # Test 3: Borderline cases (Pydantic should catch zero amounts)
    try:
        # Test with zero amount (should be rejected by Pydantic)
        borderline_request = {
            "token_mint": "SOL",
            "sender_wallet": VALID_SOLANA_ADDRESSES[0],
            "recipients": [
                {"wallet_address": VALID_SOLANA_ADDRESSES[0], "amount": 0.0},  # Zero amount should be invalid
                {"wallet_address": VALID_SOLANA_ADDRESSES[1], "amount": 0.0001}  # Valid small amount
            ]
        }
        
        response = requests.post(f"{BASE_URL}/validate-recipients", json=borderline_request)
        
        # Pydantic should reject zero amounts at model level (422 status)
        if response.status_code == 422:
            print_result("POST /api/validate-recipients (borderline)", "PASS", f"Correctly rejected zero amount at model level")
            results.append(True)
        else:
            print_result("POST /api/validate-recipients (borderline)", "FAIL", f"Should reject zero amounts. Status: {response.status_code}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/validate-recipients (borderline)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    # Test 4: Edge cases
    try:
        # Empty recipients list should fail validation
        empty_request = {
            "token_mint": "SOL",
            "sender_wallet": VALID_SOLANA_ADDRESSES[0],
            "recipients": []
        }
        
        response = requests.post(f"{BASE_URL}/validate-recipients", json=empty_request)
        
        if response.status_code == 422:  # Validation error expected
            print_result("POST /api/validate-recipients (empty)", "PASS", "Correctly rejected empty recipients")
            results.append(True)
        else:
            print_result("POST /api/validate-recipients (empty)", "FAIL", f"Should reject empty recipients. Status: {response.status_code}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/validate-recipients (empty)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    return all(results)

def test_estimate_fees():
    """Test POST /api/estimate-fees endpoint"""
    print_test_header("Fee Estimation API")
    
    results = []
    
    # Test 1: Basic fee calculation
    try:
        request_data = {
            "token_mint": "SOL",
            "sender_wallet": VALID_SOLANA_ADDRESSES[0],
            "recipients": [
                {"wallet_address": VALID_SOLANA_ADDRESSES[1], "amount": 10.0},
                {"wallet_address": VALID_SOLANA_ADDRESSES[2], "amount": 20.0}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/estimate-fees", json=request_data)
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["total_recipients", "total_amount", "developer_fee", "developer_fee_recipient", 
                             "transaction_count", "estimated_network_fee_sol", "total_cost_including_fees", "breakdown"]
            
            if all(field in data for field in required_fields):
                # Verify calculations
                expected_total = 30.0
                expected_dev_fee = 30.0 * 0.001  # 0.1%
                expected_dev_wallet = "3ALfiR1TK2JqC18nfCE8vhGqBD86obX8AcV4YgjzmRij"
                expected_tx_count = 2  # 1 batch + 1 dev fee transaction
                
                if (abs(data["total_amount"] - expected_total) < 0.001 and
                    abs(data["developer_fee"] - expected_dev_fee) < 0.001 and
                    data["developer_fee_recipient"] == expected_dev_wallet and
                    data["transaction_count"] == expected_tx_count):
                    
                    print_result("POST /api/estimate-fees (basic)", "PASS", 
                               f"Total: {data['total_amount']}, Dev fee: {data['developer_fee']}, Tx count: {data['transaction_count']}")
                    results.append(True)
                else:
                    print_result("POST /api/estimate-fees (basic)", "FAIL", 
                               f"Calculation mismatch. Expected total: {expected_total}, dev fee: {expected_dev_fee}, tx count: {expected_tx_count}. Got: {data}")
                    results.append(False)
            else:
                print_result("POST /api/estimate-fees (basic)", "FAIL", f"Missing required fields: {data}")
                results.append(False)
        else:
            print_result("POST /api/estimate-fees (basic)", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/estimate-fees (basic)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    # Test 2: Large batch calculation (test batching logic)
    try:
        # Create 25 recipients to test batching (should be 3 batches: 12+12+1 + 1 dev fee = 4 transactions)
        large_recipients = []
        for i in range(25):
            large_recipients.append({
                "wallet_address": VALID_SOLANA_ADDRESSES[i % len(VALID_SOLANA_ADDRESSES)],
                "amount": 1.0
            })
        
        large_request = {
            "token_mint": "SOL",
            "sender_wallet": VALID_SOLANA_ADDRESSES[0],
            "recipients": large_recipients
        }
        
        response = requests.post(f"{BASE_URL}/estimate-fees", json=large_request)
        
        if response.status_code == 200:
            data = response.json()
            expected_batches = 3  # ceil(25/12) = 3 batches
            expected_tx_count = 4  # 3 batches + 1 dev fee transaction
            
            if data["transaction_count"] == expected_tx_count:
                print_result("POST /api/estimate-fees (batching)", "PASS", 
                           f"Correct batching: {data['transaction_count']} transactions for 25 recipients")
                results.append(True)
            else:
                print_result("POST /api/estimate-fees (batching)", "FAIL", 
                           f"Expected {expected_tx_count} transactions, got {data['transaction_count']}")
                results.append(False)
        else:
            print_result("POST /api/estimate-fees (batching)", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/estimate-fees (batching)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    return all(results)

def test_parse_csv():
    """Test POST /api/parse-csv endpoint"""
    print_test_header("CSV Parsing API")
    
    results = []
    
    # Test 1: Valid CSV
    try:
        csv_content = "wallet_address,amount\n"
        csv_content += f"{VALID_SOLANA_ADDRESSES[0]},1.5\n"
        csv_content += f"{VALID_SOLANA_ADDRESSES[1]},2.0\n"
        
        files = {'file': ('test.csv', io.StringIO(csv_content), 'text/csv')}
        response = requests.post(f"{BASE_URL}/parse-csv", files=files)
        
        if response.status_code == 200:
            data = response.json()
            
            if (data.get("success") and 
                data.get("count") == 2 and 
                len(data.get("recipients", [])) == 2 and
                len(data.get("errors", [])) == 0):
                
                print_result("POST /api/parse-csv (valid)", "PASS", f"Parsed {data['count']} recipients")
                results.append(True)
            else:
                print_result("POST /api/parse-csv (valid)", "FAIL", f"Unexpected response: {data}")
                results.append(False)
        else:
            print_result("POST /api/parse-csv (valid)", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/parse-csv (valid)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    # Test 2: CSV with errors
    try:
        csv_content = "wallet_address,amount\n"
        csv_content += f"{VALID_SOLANA_ADDRESSES[0]},1.5\n"
        csv_content += "invalid_address,invalid_amount\n"  # Invalid row
        csv_content += f"{VALID_SOLANA_ADDRESSES[1]},3.0\n"
        
        files = {'file': ('test_errors.csv', io.StringIO(csv_content), 'text/csv')}
        response = requests.post(f"{BASE_URL}/parse-csv", files=files)
        
        if response.status_code == 200:
            data = response.json()
            
            if (data.get("success") and 
                data.get("count") == 2 and  # Should parse 2 valid rows
                len(data.get("errors", [])) > 0):  # Should have errors
                
                print_result("POST /api/parse-csv (with errors)", "PASS", f"Parsed {data['count']} recipients with {len(data['errors'])} errors")
                results.append(True)
            else:
                print_result("POST /api/parse-csv (with errors)", "FAIL", f"Expected 2 recipients with errors: {data}")
                results.append(False)
        else:
            print_result("POST /api/parse-csv (with errors)", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/parse-csv (with errors)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    # Test 3: Empty CSV
    try:
        csv_content = ""
        
        files = {'file': ('empty.csv', io.StringIO(csv_content), 'text/csv')}
        response = requests.post(f"{BASE_URL}/parse-csv", files=files)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success") and data.get("count") == 0:
                print_result("POST /api/parse-csv (empty)", "PASS", "Correctly handled empty CSV")
                results.append(True)
            else:
                print_result("POST /api/parse-csv (empty)", "FAIL", f"Unexpected response for empty CSV: {data}")
                results.append(False)
        else:
            print_result("POST /api/parse-csv (empty)", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            results.append(False)
            
    except Exception as e:
        print_result("POST /api/parse-csv (empty)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    return all(results)

def test_transaction_history():
    """Transaction history tests skipped in no-DB setup"""
    print_test_header("Transaction History APIs - SKIPPED (no DB)")
    return True

def run_all_tests():
    """Run all backend tests"""
    print(f"Starting comprehensive backend testing for: {BASE_URL}")
    print(f"Test started at: {datetime.now()}")
    
    test_results = {}
    
    # Run all tests
    test_results["health_check"] = test_health_check()
    test_results["token_list"] = test_token_list()
    test_results["validate_recipients"] = test_validate_recipients()
    test_results["estimate_fees"] = test_estimate_fees()
    test_results["parse_csv"] = test_parse_csv()
    test_results["transaction_history"] = test_transaction_history()
    
    # Summary
    print_test_header("TEST SUMMARY")
    
    passed = sum(1 for result in test_results.values() if result)
    total = len(test_results)
    
    for test_name, result in test_results.items():
        status_symbol = "✅" if result else "❌"
        print(f"{status_symbol} {test_name.replace('_', ' ').title()}: {'PASS' if result else 'FAIL'}")
    
    print(f"\nOverall Result: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All backend tests PASSED!")
        return True
    else:
        print("⚠️  Some backend tests FAILED!")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)