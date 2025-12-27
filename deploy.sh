#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

print_banner() {
    echo -e "${PURPLE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║       SheerID Veteran Verification Tool - Deploy          ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed"
        return 1
    fi
    log_success "$1 found: $(command -v $1)"
    return 0
}

print_banner

# Check requirements
log_info "Checking system requirements..."

MISSING=0

if ! check_command python3; then
    log_error "Please install Python 3.8+"
    MISSING=1
fi

if ! check_command node; then
    log_error "Please install Node.js 18+"
    MISSING=1
fi

if ! check_command npm; then
    log_error "Please install npm"
    MISSING=1
fi

if [ $MISSING -eq 1 ]; then
    log_error "Missing required dependencies. Please install them first."
    exit 1
fi

echo ""
log_info "All requirements satisfied!"
echo ""

# Backend setup
log_info "Setting up backend..."

cd "$PROJECT_DIR/backend"

if [ ! -d "venv" ]; then
    log_info "Creating Python virtual environment..."
    python3 -m venv venv
fi

log_info "Activating virtual environment..."
source venv/bin/activate

log_info "Installing Python dependencies..."
pip install -q -r requirements.txt

log_success "Backend setup complete!"
echo ""

# Frontend setup
log_info "Setting up frontend..."

cd "$PROJECT_DIR/frontend"

log_info "Installing Node.js dependencies..."
npm install --silent

log_info "Building frontend..."
npm run build

log_success "Frontend setup complete!"
echo ""

# Create .env if not exists
cd "$PROJECT_DIR"
if [ ! -f ".env" ]; then
    log_info "Creating .env file..."
    cat > .env << 'EOF'
# SheerID Veteran Verification Tool Configuration
API_HOST=0.0.0.0
API_PORT=14100
FRONTEND_PORT=14000

# Proxy Configuration (optional)
# Set PROXY_URL to route SheerID requests through a proxy
# Example: PROXY_URL=http://127.0.0.1:33300
# Leave empty or set to "direct" to disable proxy
PROXY_URL=
EOF
fi

# Summary
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  Deployment Complete!                      ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Start services:${NC}  ./manage.sh start"
echo -e "  ${CYAN}Stop services:${NC}   ./manage.sh stop"
echo -e "  ${CYAN}View status:${NC}     ./manage.sh status"
echo -e "  ${CYAN}View logs:${NC}       ./manage.sh logs"
echo ""
echo -e "  ${YELLOW}Admin setup:${NC}     首次访问 /admin 时设置管理员账号"
echo -e "  ${YELLOW}Backend URL:${NC}     http://localhost:14100"
echo -e "  ${YELLOW}Frontend URL:${NC}    http://localhost:14000"
echo ""
