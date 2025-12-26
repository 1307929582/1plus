#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PID_DIR="$PROJECT_DIR/.pids"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

print_banner() {
    echo -e "${PURPLE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║       SheerID Veteran Verification Tool - Manager         ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

is_running() {
    local pid_file="$PID_DIR/$1.pid"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

get_pid() {
    local pid_file="$PID_DIR/$1.pid"
    if [ -f "$pid_file" ]; then
        cat "$pid_file"
    fi
}

start_backend() {
    if is_running "backend"; then
        log_warn "Backend already running (PID: $(get_pid backend))"
        return 0
    fi

    log_info "Starting backend..."
    cd "$BACKEND_DIR"

    if [ -d "venv" ]; then
        source venv/bin/activate
    elif [ -d "$PROJECT_DIR/venv" ]; then
        source "$PROJECT_DIR/venv/bin/activate"
    fi

    nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid"

    sleep 2
    if is_running "backend"; then
        log_success "Backend started (PID: $(get_pid backend))"
    else
        log_error "Failed to start backend. Check logs/backend.log"
        return 1
    fi
}

stop_backend() {
    if ! is_running "backend"; then
        log_warn "Backend is not running"
        return 0
    fi

    local pid=$(get_pid backend)
    log_info "Stopping backend (PID: $pid)..."
    kill "$pid" 2>/dev/null
    rm -f "$PID_DIR/backend.pid"
    log_success "Backend stopped"
}

start_frontend() {
    if is_running "frontend"; then
        log_warn "Frontend already running (PID: $(get_pid frontend))"
        return 0
    fi

    log_info "Starting frontend..."
    cd "$FRONTEND_DIR"

    nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$PID_DIR/frontend.pid"

    sleep 3
    if is_running "frontend"; then
        log_success "Frontend started (PID: $(get_pid frontend))"
    else
        log_error "Failed to start frontend. Check logs/frontend.log"
        return 1
    fi
}

stop_frontend() {
    if ! is_running "frontend"; then
        log_warn "Frontend is not running"
        return 0
    fi

    local pid=$(get_pid frontend)
    log_info "Stopping frontend (PID: $pid)..."
    kill "$pid" 2>/dev/null

    # Also kill child processes (vite)
    pkill -P "$pid" 2>/dev/null

    rm -f "$PID_DIR/frontend.pid"
    log_success "Frontend stopped"
}

cmd_start() {
    local service=$1
    case $service in
        backend)
            start_backend
            ;;
        frontend)
            start_frontend
            ;;
        ""|all)
            start_backend
            start_frontend
            echo ""
            log_success "All services started!"
            echo ""
            echo -e "  ${CYAN}Backend:${NC}  http://localhost:8000"
            echo -e "  ${CYAN}Frontend:${NC} http://localhost:5173"
            echo -e "  ${CYAN}Admin:${NC}    http://localhost:5173/admin"
            echo ""
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Available: backend, frontend, all"
            ;;
    esac
}

cmd_stop() {
    local service=$1
    case $service in
        backend)
            stop_backend
            ;;
        frontend)
            stop_frontend
            ;;
        ""|all)
            stop_frontend
            stop_backend
            log_success "All services stopped"
            ;;
        *)
            log_error "Unknown service: $service"
            ;;
    esac
}

cmd_restart() {
    local service=$1
    cmd_stop "$service"
    sleep 1
    cmd_start "$service"
}

cmd_status() {
    echo ""
    echo -e "${CYAN}Service Status:${NC}"
    echo ""

    if is_running "backend"; then
        echo -e "  Backend:  ${GREEN}● Running${NC} (PID: $(get_pid backend))"
    else
        echo -e "  Backend:  ${RED}○ Stopped${NC}"
    fi

    if is_running "frontend"; then
        echo -e "  Frontend: ${GREEN}● Running${NC} (PID: $(get_pid frontend))"
    else
        echo -e "  Frontend: ${RED}○ Stopped${NC}"
    fi
    echo ""
}

cmd_logs() {
    local service=$1
    local lines=${2:-50}

    case $service in
        backend)
            if [ -f "$LOG_DIR/backend.log" ]; then
                tail -n "$lines" -f "$LOG_DIR/backend.log"
            else
                log_error "No backend logs found"
            fi
            ;;
        frontend)
            if [ -f "$LOG_DIR/frontend.log" ]; then
                tail -n "$lines" -f "$LOG_DIR/frontend.log"
            else
                log_error "No frontend logs found"
            fi
            ;;
        ""|all)
            log_info "Use: ./manage.sh logs backend  OR  ./manage.sh logs frontend"
            ;;
        *)
            log_error "Unknown service: $service"
            ;;
    esac
}

cmd_db() {
    local action=$1
    local db_file="$BACKEND_DIR/sheerid_veteran.db"

    case $action in
        backup)
            local backup_name="backup_$(date +%Y%m%d_%H%M%S).db"
            cp "$db_file" "$PROJECT_DIR/$backup_name"
            log_success "Database backed up to: $backup_name"
            ;;
        reset)
            read -p "This will DELETE all data. Are you sure? (yes/no): " confirm
            if [ "$confirm" = "yes" ]; then
                rm -f "$db_file"
                log_success "Database reset. Restart backend to recreate."
            else
                log_info "Cancelled"
            fi
            ;;
        stats)
            if [ -f "$db_file" ]; then
                echo ""
                echo -e "${CYAN}Database Statistics:${NC}"
                echo ""
                sqlite3 "$db_file" "SELECT 'Veterans: ' || COUNT(*) FROM veterans;"
                sqlite3 "$db_file" "SELECT 'Verified: ' || COUNT(*) FROM veterans WHERE status='success';"
                sqlite3 "$db_file" "SELECT 'Pending: ' || COUNT(*) FROM veterans WHERE status='pending';"
                sqlite3 "$db_file" "SELECT 'Codes: ' || COUNT(*) FROM redeem_codes;"
                sqlite3 "$db_file" "SELECT 'Active Codes: ' || COUNT(*) FROM redeem_codes WHERE is_active=1;"
                echo ""
            else
                log_error "Database not found"
            fi
            ;;
        *)
            echo "Usage: ./manage.sh db [backup|reset|stats]"
            ;;
    esac
}

cmd_help() {
    print_banner
    echo -e "${CYAN}Usage:${NC} ./manage.sh <command> [options]"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo "  start [service]     Start services (backend/frontend/all)"
    echo "  stop [service]      Stop services"
    echo "  restart [service]   Restart services"
    echo "  status              Show service status"
    echo "  logs <service>      Tail service logs (backend/frontend)"
    echo "  db <action>         Database operations (backup/reset/stats)"
    echo "  help                Show this help"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./manage.sh start           # Start all services"
    echo "  ./manage.sh start backend   # Start only backend"
    echo "  ./manage.sh logs backend    # View backend logs"
    echo "  ./manage.sh db stats        # Show database stats"
    echo ""
}

# Main
case $1 in
    start)
        cmd_start "$2"
        ;;
    stop)
        cmd_stop "$2"
        ;;
    restart)
        cmd_restart "$2"
        ;;
    status)
        cmd_status
        ;;
    logs)
        cmd_logs "$2" "$3"
        ;;
    db)
        cmd_db "$2"
        ;;
    help|--help|-h|"")
        cmd_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use './manage.sh help' for usage"
        exit 1
        ;;
esac
