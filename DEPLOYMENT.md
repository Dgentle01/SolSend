# 🚀 Solsend Deployment Guide

## Quick Deploy Buttons

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/solsend)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/solsend)

## 🛠️ Deployment Options

### Option 1: Vercel (Full-Stack - Recommended)

Vercel can handle both frontend and serverless backend in one deployment:

#### Prerequisites
This project does not require a database for the default multi-send flow. If you want persistent transaction history later, you can add a database and configure connection strings in Vercel environment variables.

#### Deploy Steps
1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Clone and Deploy**
   ```bash
   git clone https://github.com/yourusername/solsend.git
   cd solsend
   vercel --prod
   ```

3. **Configure Environment Variables in Vercel Dashboard**
   ```bash
   MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/
   DB_NAME=solsend_production
   CORS_ORIGINS=https://your-app.vercel.app
   ```

4. **Update Frontend Environment**
   - In Vercel dashboard → Settings → Environment Variables
   ```bash
   REACT_APP_BACKEND_URL=https://your-app.vercel.app
   REACT_APP_SOLANA_NETWORK=mainnet-beta
   GENERATE_SOURCEMAP=false
   ```

### Option 2: Netlify (Frontend) + Railway/Heroku (Backend)

#### Frontend Deployment (Netlify)
1. **Install Netlify CLI**
   ```bash
   npm i -g netlify-cli
   ```

2. **Build and Deploy Frontend**
   ```bash
   cd frontend
   yarn build
   netlify deploy --prod --dir=build
   ```

3. **Configure Environment Variables in Netlify**
   - Go to Site Settings → Environment Variables
   ```bash
   REACT_APP_BACKEND_URL=https://your-backend.railway.app
   REACT_APP_SOLANA_NETWORK=mainnet-beta
   ```

#### Backend Deployment Options

**Railway (Recommended)**
```bash
cd backend
# Install Railway CLI
npm i -g @railway/cli
# Deploy
railway login
railway up
```

**Heroku**
```bash
cd backend
# Create Procfile (already included)
echo "web: uvicorn server:app --host=0.0.0.0 --port=\$PORT" > Procfile
# Deploy
heroku create your-solsend-backend
heroku config:set MONGO_URL=mongodb+srv://...
heroku config:set DB_NAME=solsend_production
git subtree push --prefix backend heroku main
```

**Render**
```bash
# Use the included Dockerfile in backend/
# Set environment variables in Render dashboard
```

### Option 3: Docker Deployment

```bash
# Build images
docker build -t solsend-frontend ./frontend
docker build -t solsend-backend ./backend

# Run with docker-compose
docker-compose up -d
```

## 🔧 Pre-Deployment Checklist

### 1. Environment Setup
- [ ] MongoDB Atlas cluster created and configured
- [ ] Connection string obtained and tested
- [ ] Database user created with read/write permissions
- [ ] Network access configured (IP whitelist or 0.0.0.0/0)

### 2. Frontend Configuration
- [ ] `REACT_APP_BACKEND_URL` points to production backend
- [ ] `REACT_APP_SOLANA_NETWORK` set to `mainnet-beta` for production
- [ ] Build succeeds without errors (`yarn build`)
- [ ] All wallet adapters working in production

### 3. Backend Configuration
- [ ] `MONGO_URL` environment variable set
- [ ] `CORS_ORIGINS` configured with frontend domains
- [ ] All API endpoints tested
- [ ] File upload functionality verified

### 4. Security
- [ ] Remove wildcard CORS origins for production
- [ ] Enable HTTPS redirects
- [ ] Configure proper CSP headers
- [ ] Set up rate limiting (optional)

### 5. Performance
- [ ] Enable gzip compression
- [ ] Configure CDN for static assets
- [ ] Optimize bundle size
- [ ] Test wallet connection speed

## 🌐 Custom Domain Setup

### Vercel
1. Go to Vercel Dashboard → Project → Settings → Domains
2. Add your domain (e.g., `solsend.com`)
3. Configure DNS records:
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   
   Type: A
   Name: @
   Value: 76.76.19.61
   ```

### Netlify
1. Go to Netlify Dashboard → Site → Domain Settings
2. Add custom domain
3. Configure DNS records:
   ```
   Type: CNAME
   Name: www
   Value: your-site.netlify.app
   
   Type: A
   Name: @
   Value: 75.2.60.5
   ```

## 🧪 Testing Production Deployment

### Frontend Tests
```bash
# Test build locally
cd frontend
yarn build
npx serve -s build

# Test wallet connections
# Test CSV upload
# Test multi-send functionality
```

### Backend Tests
```bash
# Health check
curl https://your-backend.com/api/

# Token list
curl https://your-backend.com/api/token-list

# Validation test
curl -X POST https://your-backend.com/api/validate-recipients \
  -H "Content-Type: application/json" \
  -d '{"token_mint":"SOL","sender_wallet":"test","recipients":[{"wallet_address":"invalid","amount":0.1}]}'
```

## 🚨 Troubleshooting

### Common Issues

1. **CORS Errors**
   ```
   Error: Access to fetch blocked by CORS policy
   Solution: Check CORS_ORIGINS environment variable includes your frontend domain
   ```

2. **MongoDB Connection Failed**
   ```
   Error: MongoServerError: Authentication failed
   Solution: Verify MONGO_URL format and database user permissions
   ```

3. **Wallet Connection Issues**
   ```
   Error: Wallet adapter not found
   Solution: Ensure HTTPS is enabled (required for wallet adapters)
   ```

4. **Build Failures**
   ```
   Error: Module not found
   Solution: Clear node_modules and reinstall dependencies
   ```

5. **Vercel Function Timeout**
   ```
   Error: Function exceeded maximum duration
   Solution: Optimize database queries or increase timeout in vercel.json
   ```

### Debug Commands

```bash
# Check frontend build
cd frontend && yarn build

# Check backend dependencies
cd backend && pip install -r requirements.txt

# Test local connection
curl http://localhost:8001/api/

# Check environment variables
echo $REACT_APP_BACKEND_URL
echo $MONGO_URL
```

## 📊 Monitoring & Analytics

### Add Monitoring

1. **Sentry (Error Tracking)**
   ```bash
   # Frontend
   yarn add @sentry/react @sentry/tracing
   
   # Backend
   pip install sentry-sdk[fastapi]
   ```

2. **Google Analytics**
   ```html
   <!-- Add to public/index.html -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
   ```

3. **Vercel Analytics**
   ```bash
   yarn add @vercel/analytics
   ```

### Performance Monitoring
- Transaction success rates
- API response times
- Wallet connection times
- Bundle size monitoring

## 🔄 CI/CD Setup

### GitHub Actions (Optional)
Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Solsend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

## 🆘 Support

If you encounter issues:

1. Check the [troubleshooting section](#🚨-troubleshooting)
2. Review environment variables
3. Test with minimal configuration
4. Check platform status pages (Vercel, Netlify, MongoDB Atlas)

---

**🎉 Your Solsend app should now be live and ready for users to send Solana tokens efficiently!**
