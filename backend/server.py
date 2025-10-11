from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import base58
import csv
import io
from decimal import Decimal

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Solana Multi-Send API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Developer wallet for 0.1% fee
DEVELOPER_WALLET = "3ALfiR1TK2JqC18nfCE8vhGqBD86obX8AcV4YgjzmRij"
DEVELOPER_FEE_PERCENT = 0.001  # 0.1%

# Solana constants
LAMPORTS_PER_SOL = 1_000_000_000
BASE_FEE_LAMPORTS = 5000  # Base transaction fee
PRIORITY_FEE_LAMPORTS = 10000  # Additional priority fee

# Define Models
class RecipientInput(BaseModel):
    wallet_address: str = Field(..., description="Recipient wallet address")
    amount: float = Field(..., gt=0, description="Amount to send")
    
    @validator('wallet_address')
    def validate_address(cls, v):
        """Basic validation for Solana address format."""
        if not v or len(v) < 32 or len(v) > 44:
            raise ValueError("Invalid Solana address length")
        try:
            # Attempt to decode as base58
            base58.b58decode(v)
        except Exception:
            raise ValueError("Invalid base58 encoding")
        return v

class MultiSendRequest(BaseModel):
    token_mint: str = Field(..., description="Token mint address (use 'SOL' for native SOL)")
    sender_wallet: str = Field(..., description="Sender wallet address")
    recipients: List[RecipientInput] = Field(..., min_items=1, max_items=1000)

class ValidationResult(BaseModel):
    address: str
    amount: float
    valid: bool
    issues: List[str] = []

class ValidationResponse(BaseModel):
    total_recipients: int
    valid_recipients: int
    invalid_recipients: int
    validation_results: List[ValidationResult]
    ready_to_send: bool

class FeeEstimate(BaseModel):
    total_recipients: int
    total_amount: float
    developer_fee: float
    developer_fee_recipient: str
    transaction_count: int
    estimated_network_fee_sol: float
    total_cost_including_fees: float
    breakdown: str

class TransactionHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sender_wallet: str
    token_mint: str
    recipient_count: int
    total_amount: float
    developer_fee: float
    status: str  # pending, confirmed, failed
    signatures: List[str] = []
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

def validate_solana_address(address: str) -> tuple[bool, List[str]]:
    """Validate a Solana address format."""
    issues = []
    
    if not address:
        issues.append("Address is empty")
        return False, issues
    
    if len(address) < 32 or len(address) > 44:
        issues.append(f"Invalid address length: {len(address)} (expected 32-44)")
        return False, issues
    
    try:
        decoded = base58.b58decode(address)
        if len(decoded) != 32:
            issues.append(f"Decoded address is not 32 bytes: {len(decoded)}")
            return False, issues
    except Exception as e:
        issues.append(f"Invalid base58 encoding: {str(e)}")
        return False, issues
    
    return True, []

def calculate_batches(recipient_count: int, max_per_batch: int = 12) -> int:
    """Calculate number of transaction batches needed."""
    return (recipient_count + max_per_batch - 1) // max_per_batch

def calculate_developer_fee(total_amount: float) -> float:
    """Calculate 0.1% developer fee."""
    return round(total_amount * DEVELOPER_FEE_PERCENT, 9)

def estimate_transaction_fees(transaction_count: int) -> float:
    """Estimate total network fees in SOL."""
    fee_per_tx = (BASE_FEE_LAMPORTS + PRIORITY_FEE_LAMPORTS) / LAMPORTS_PER_SOL
    return round(transaction_count * fee_per_tx, 9)

@api_router.get("/")
async def root():
    return {"message": "Solana Multi-Send API", "version": "1.0.0"}

@api_router.post("/validate-recipients", response_model=ValidationResponse)
async def validate_recipients(request: MultiSendRequest):
    """
    Validate all recipient addresses and amounts.
    """
    validation_results = []
    valid_count = 0
    
    for recipient in request.recipients:
        is_valid, issues = validate_solana_address(recipient.wallet_address)
        
        # Additional validation
        if recipient.amount <= 0:
            is_valid = False
            issues.append("Amount must be greater than 0")
        
        if is_valid:
            valid_count += 1
        
        validation_results.append(ValidationResult(
            address=recipient.wallet_address,
            amount=recipient.amount,
            valid=is_valid,
            issues=issues
        ))
    
    return ValidationResponse(
        total_recipients=len(request.recipients),
        valid_recipients=valid_count,
        invalid_recipients=len(request.recipients) - valid_count,
        validation_results=validation_results,
        ready_to_send=valid_count == len(request.recipients)
    )

@api_router.post("/estimate-fees", response_model=FeeEstimate)
async def estimate_fees(request: MultiSendRequest):
    """
    Calculate estimated fees for the multi-send operation.
    Includes 0.1% developer fee and network transaction fees.
    """
    total_amount = sum(r.amount for r in request.recipients)
    developer_fee = calculate_developer_fee(total_amount)
    
    # Calculate batches (12 transfers per transaction for safety)
    transaction_count = calculate_batches(len(request.recipients), max_per_batch=12)
    
    # Add 1 transaction for developer fee
    transaction_count += 1
    
    network_fee = estimate_transaction_fees(transaction_count)
    
    total_cost = total_amount + developer_fee + network_fee
    
    breakdown = f"""
Recipient Transfers: {total_amount} {request.token_mint if request.token_mint != 'SOL' else 'SOL'}
Developer Fee (0.1%): {developer_fee} {request.token_mint if request.token_mint != 'SOL' else 'SOL'}
Network Fees: ~{network_fee} SOL (for {transaction_count} transactions)
---
Total: {total_amount + developer_fee} {request.token_mint if request.token_mint != 'SOL' else 'SOL'} + ~{network_fee} SOL network fees
"""
    
    return FeeEstimate(
        total_recipients=len(request.recipients),
        total_amount=total_amount,
        developer_fee=developer_fee,
        developer_fee_recipient=DEVELOPER_WALLET,
        transaction_count=transaction_count,
        estimated_network_fee_sol=network_fee,
        total_cost_including_fees=total_cost,
        breakdown=breakdown.strip()
    )

@api_router.post("/parse-csv")
async def parse_csv_file(file: UploadFile = File(...)):
    """
    Parse CSV file with recipient addresses and amounts.
    Expected format: wallet_address, amount
    """
    try:
        contents = await file.read()
        decoded = contents.decode('utf-8')
        
        csv_reader = csv.reader(io.StringIO(decoded))
        recipients = []
        errors = []
        
        for idx, row in enumerate(csv_reader, start=1):
            # Skip empty rows
            if not row or not any(row):
                continue
            
            # Skip header row if it looks like a header
            if idx == 1 and ('address' in row[0].lower() or 'wallet' in row[0].lower()):
                continue
            
            if len(row) < 2:
                errors.append(f"Row {idx}: Missing amount column")
                continue
            
            wallet_address = row[0].strip()
            try:
                amount = float(row[1].strip())
            except ValueError:
                errors.append(f"Row {idx}: Invalid amount '{row[1]}'")
                continue
            
            recipients.append({
                "wallet_address": wallet_address,
                "amount": amount
            })
        
        return {
            "success": True,
            "recipients": recipients,
            "count": len(recipients),
            "errors": errors
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

@api_router.get("/token-list")
async def get_token_list():
    """
    Return a list of common SPL tokens.
    """
    tokens = [
        {
            "symbol": "SOL",
            "name": "Solana",
            "mint": "SOL",
            "decimals": 9,
            "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
        },
        {
            "symbol": "USDC",
            "name": "USD Coin",
            "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "decimals": 6,
            "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
        },
        {
            "symbol": "USDT",
            "name": "Tether USD",
            "mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
            "decimals": 6,
            "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg"
        }
    ]
    
    return {"tokens": tokens}

@api_router.post("/save-transaction", response_model=TransactionHistory)
async def save_transaction(tx_data: TransactionHistory):
    """
    Save transaction history to database.
    """
    doc = tx_data.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    await db.transactions.insert_one(doc)
    return tx_data

@api_router.get("/transaction-history/{wallet_address}")
async def get_transaction_history(wallet_address: str, limit: int = 50):
    """
    Get transaction history for a wallet.
    """
    transactions = await db.transactions.find(
        {"sender_wallet": wallet_address},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Convert timestamps back
    for tx in transactions:
        if isinstance(tx['timestamp'], str):
            tx['timestamp'] = datetime.fromisoformat(tx['timestamp'])
    
    return {"transactions": transactions}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
