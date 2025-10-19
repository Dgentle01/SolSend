# 🚀 Solsend - Solana Multi-Send Application

**Send SOL & SPL tokens to multiple recipients efficiently using batched transactions**

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/solsend)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/solsend)

## ✨ Features

- 🔐 **Secure Wallet Integration** - Phantom, Solflare, and Torus wallet support
- 💰 **Multi-Token Support** - Send SOL, USDC, USDT to multiple recipients
- 📊 **Smart Batching** - Optimizes transaction fees with 12 transfers per batch
- 📁 **CSV Upload** - Bulk recipient import from CSV files
- 💸 **Fee Estimation** - Real-time cost calculation including 0.1% developer fee
- 📈 **Transaction History** - Track all multi-send operations
- 🎨 **Modern UI** - Built with React 19 + Tailwind CSS + shadcn/ui
- 🔒 **Security First** - Address validation, input sanitization, secure headers

## 🛠️ Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **Pydantic** - Data validation and settings management
- **Solana** - Base58 address validation and blockchain integration

### Frontend
- **React 19** - Latest React with concurrent features
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - High-quality accessible components
- **Solana Web3.js** - Blockchain interaction library
- **Wallet Adapter** - Multi-wallet connection support

### DevOps & Deployment
- **Vercel** - Serverless deployment for full-stack apps
- **Netlify** - Frontend deployment with CDN
- **Docker** - Containerized development and deployment
- **GitHub Actions** - CI/CD automation

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 22.0.0 (recommended)
- **Python** >= 3.11
- **Yarn** package manager

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/Dgentle01/solsend.git
   cd solsend
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   yarn install
   
   # Install frontend dependencies
   cd frontend && yarn install
   
   # Install backend dependencies
   cd ../backend && pip install -r requirements.txt
   ```

3. **Setup environment variables**
   ```bash
   # Copy example environment files (frontend only)
   cp frontend/.env.example frontend/.env
    
   # Edit the files with your configuration
   ```

4. **Start development servers**
   ```bash
   # Start both frontend and backend
   yarn dev
   
   # Or start individually
   cd backend && uvicorn server:app --reload --host 0.0.0.0 --port 8001
   cd frontend && yarn start
   ```

5. **Visit the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8001/api
   - API Docs: http://localhost:8001/docs

### Docker Development

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 🌐 Deployment

### Option 1: Vercel (Recommended)

Vercel can host the static frontend and run the FastAPI backend as serverless functions (no database required).

1. **Deploy to Vercel**
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Deploy
   vercel --prod
   ```

### Option 2: Netlify (Frontend) + Railway/Heroku (Backend)

1. **Deploy Frontend to Netlify**
   ```bash
   cd frontend
   yarn build
   netlify deploy --prod --dir=build
   ```

2. **Deploy Backend to Railway**
   ```bash
   cd backend
   railway up
   ```

3. **Update environment variables**
   - Set `REACT_APP_BACKEND_URL` in Netlify to your Railway backend URL

### Option 3: Custom Docker Deployment

```bash
# Build and deploy with Docker
docker build -t solsend-frontend ./frontend
docker build -t solsend-backend ./backend

# Run with docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

## 📋 Environment Variables

### Backend (.env)
The backend is serverless and does not require a database for the default flow. If you later add persistence, configure database secrets separately.
```bash
# Example: CORS origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,https://yourapp.com
DEVELOPER_WALLET=7N2NBbR2bXJkga5HsFUAgAi4rBtAr5VSVJdvkYXq8vxk
```

### Frontend (.env)
```bash
REACT_APP_BACKEND_URL=http://localhost:8001
REACT_APP_SOLANA_NETWORK=devnet  # or mainnet-beta
```

## 🔧 Configuration

### Supported Wallets
- Phantom Wallet
- Solflare Wallet  
- Torus Wallet

### Supported Tokens
- **SOL** - Native Solana token
- **USDC** - USD Coin (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
- **USDT** - Tether USD (Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB)

### Fee Structure
- **Developer Fee**: 0.1% of total transfer amount
- **Network Fees**: ~0.00001 SOL per transaction
- **Batch Size**: 12 transfers per transaction (optimal for fees)

## 🧪 Testing

### Backend Tests
```bash
cd backend
python -m pytest tests/ -v
```

### Frontend Tests
```bash
cd frontend
yarn test
```

### End-to-End Testing
```bash
# Use devnet RPC and test wallets when running end-to-end locally
REACT_APP_SOLANA_RPC=https://api.devnet.solana.com yarn dev
```

## 📊 API Documentation

### Core Endpoints

- `GET /api/` - Health check
- `GET /api/token-list` - Available tokens
- `POST /api/validate-recipients` - Validate wallet addresses
- `POST /api/estimate-fees` - Calculate transaction costs
- `POST /api/parse-csv` - Parse CSV recipient file
 (Transaction persistence disabled in no-DB setup)

### Example API Usage

```javascript
// Validate recipients
const response = await fetch('/api/validate-recipients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token_mint: 'SOL',
    sender_wallet: '3ALfiR1TK2JqC18nfCE8vhGqBD86obX8AcV4YgjzmRij',
    recipients: [
      { wallet_address: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi', amount: 0.1 }
    ]
  })
});
```

## 🔒 Security

### Implemented Security Measures
- ✅ Address validation (Base58 + length checks)
- ✅ Amount validation (positive numbers only)
- ✅ CORS configuration
- ✅ Input sanitization
- ✅ Rate limiting ready
- ✅ Security headers
- ✅ Content Security Policy for Solana dApps

### Production Security Checklist
- [ ] Enable MongoDB Atlas IP whitelisting
- [ ] Configure proper CORS origins (remove wildcards)
- [ ] Add rate limiting to backend APIs
- [ ] Enable HTTPS redirects
- [ ] Set up monitoring (Sentry)
- [ ] Regular dependency updates

## 🐛 Troubleshooting

### Common Issues

1. **CORS Errors**
   - Verify `CORS_ORIGINS` includes your frontend domain
   - Check browser developer tools for blocked requests

2. **Wallet Connection Issues**
   - Ensure HTTPS is enabled (wallets require secure context)
   - Try different wallet adapters
   - Clear browser cache

3. **Build Failures**
   - Check Node.js version compatibility (>=18)
   - Clear node_modules: `rm -rf node_modules && yarn install`
   - Verify environment variables

4. **Database Connection**
   - Check MongoDB Atlas IP whitelist
   - Verify connection string format
   - Test database permissions

## 📈 Performance Optimization

### Frontend Optimizations
- Code splitting by vendor and features
- Lazy loading of components
- Bundle size analysis with `yarn build:analyze`
- Service worker for caching
- Image optimization

### Backend Optimizations
- MongoDB indexing on frequently queried fields
- Response compression
- Connection pooling
- Caching for token metadata

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Create a Pull Request

### Development Guidelines
- Follow ESLint configuration
- Add tests for new features
- Update documentation
- Use conventional commits

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Solana Labs](https://solana.com) - Blockchain infrastructure
- [Vercel](https://vercel.com) - Deployment platform
- [shadcn/ui](https://ui.shadcn.com) - UI components
- [Radix UI](https://radix-ui.com) - Accessible primitives

## 📞 Support

- 📧 Email: support@yourapp.com
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/solsend/issues)
- 💬 Discord: [Join Community](https://discord.gg/yourserver)

---

**⚡ Built with ❤️ for the Solana ecosystem**
