#!/bin/bash

# SheerID Veteran Verification Tool - CLI Manager
# 用法: ./manage.sh [命令]
# 生产环境建议使用 nginx 服务前端，只需启动后端

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 正确解析符号链接获取真实脚本路径
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
    DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
    LINK="$(readlink "$SOURCE")"
    if [[ "$LINK" != /* ]]; then
        SOURCE="$DIR/$LINK"
    else
        SOURCE="$LINK"
    fi
done
PROJECT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PID_DIR="$PROJECT_DIR/.pids"
LOG_DIR="$PROJECT_DIR/logs"
DB_FILE="$BACKEND_DIR/sheerid_veteran.db"

BACKEND_PORT=14100
FRONTEND_PORT=14000

# 检测是否为生产环境（Linux 且非 localhost）
IS_PRODUCTION=false
if [[ "$(uname)" == "Linux" ]]; then
    IS_PRODUCTION=true
fi

mkdir -p "$PID_DIR" "$LOG_DIR"

show_logo() {
    echo -e "${PURPLE}"
    echo "  ╔═══════════════════════════════════════════════════════╗"
    echo "  ║     SheerID Veteran Verification Tool - Manager       ║"
    echo "  ╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

show_menu() {
    echo -e "${GREEN}请选择操作:${NC}"
    echo ""
    echo -e "  ${YELLOW}1)${NC}  查看状态       - 查看服务运行状态"
    echo -e "  ${YELLOW}2)${NC}  启动服务       - 启动所有服务"
    echo -e "  ${YELLOW}3)${NC}  停止服务       - 停止所有服务"
    echo -e "  ${YELLOW}4)${NC}  重启服务       - 重启所有服务"
    echo -e "  ${YELLOW}5)${NC}  查看后端日志   - 实时查看后端日志"
    echo -e "  ${YELLOW}6)${NC}  查看前端日志   - 实时查看前端日志"
    echo -e "  ${YELLOW}7)${NC}  数据库统计     - 查看数据库统计信息"
    echo -e "  ${YELLOW}8)${NC}  数据库备份     - 备份 SQLite 数据库"
    echo -e "  ${YELLOW}9)${NC}  数据库重置     - 重置数据库 (危险)"
    echo -e "  ${YELLOW}10)${NC} 重新部署       - 重新安装依赖并构建"
    echo -e "  ${YELLOW}11)${NC} 更新系统       - 拉取最新代码并重建"
    echo -e "  ${YELLOW}0)${NC}  退出"
    echo ""
}

# 强制杀掉占用指定端口的所有进程
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}杀掉占用端口 $port 的进程: $pids${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 1
    fi
}

# 等待端口释放
wait_port_free() {
    local port=$1
    local max_wait=10
    local count=0
    while lsof -ti:$port >/dev/null 2>&1; do
        if [ $count -ge $max_wait ]; then
            echo -e "${RED}端口 $port 无法释放${NC}"
            return 1
        fi
        sleep 1
        ((count++))
    done
    return 0
}

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

status() {
    echo -e "${CYAN}═══════════════════ 服务状态 ═══════════════════${NC}"
    echo ""

    if is_running "backend"; then
        echo -e "  后端服务 (API)   : ${GREEN}● 运行中${NC} (PID: $(get_pid backend))"
        echo -e "                     ${BLUE}http://localhost:$BACKEND_PORT${NC}"
    else
        echo -e "  后端服务 (API)   : ${RED}○ 未运行${NC}"
    fi

    echo ""

    if is_running "frontend"; then
        echo -e "  前端服务 (Vite)  : ${GREEN}● 运行中${NC} (PID: $(get_pid frontend))"
        echo -e "                     ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
        echo -e "                     ${BLUE}http://localhost:$FRONTEND_PORT/admin${NC}"
    else
        echo -e "  前端服务 (Vite)  : ${RED}○ 未运行${NC}"
    fi

    echo ""

    if [ -f "$DB_FILE" ]; then
        local size=$(ls -lh "$DB_FILE" | awk '{print $5}')
        echo -e "  数据库文件       : ${GREEN}● 存在${NC} ($size)"
    else
        echo -e "  数据库文件       : ${YELLOW}○ 未创建${NC}"
    fi

    echo ""
    echo -e "${CYAN}═════════════════════════════════════════════════${NC}"
}

stop_backend() {
    echo -e "${BLUE}停止后端服务...${NC}"

    # 先尝试优雅停止
    if is_running "backend"; then
        local pid=$(get_pid backend)
        kill "$pid" 2>/dev/null
        sleep 2
    fi

    # 强制杀掉端口上的所有进程
    kill_port $BACKEND_PORT

    # 清理 PID 文件
    rm -f "$PID_DIR/backend.pid"

    echo -e "${GREEN}✓ 后端服务已停止${NC}"
}

stop_frontend() {
    echo -e "${BLUE}停止前端服务...${NC}"

    # 先尝试优雅停止
    if is_running "frontend"; then
        local pid=$(get_pid frontend)
        kill "$pid" 2>/dev/null
        pkill -P "$pid" 2>/dev/null
        sleep 2
    fi

    # 强制杀掉端口上的所有进程
    kill_port $FRONTEND_PORT

    # 清理 PID 文件
    rm -f "$PID_DIR/frontend.pid"

    echo -e "${GREEN}✓ 前端服务已停止${NC}"
}

start_backend() {
    echo -e "${BLUE}启动后端服务...${NC}"

    # 确保端口空闲
    kill_port $BACKEND_PORT
    if ! wait_port_free $BACKEND_PORT; then
        echo -e "${RED}✗ 端口 $BACKEND_PORT 被占用，无法启动${NC}"
        return 1
    fi

    cd "$BACKEND_DIR"

    # 确定 Python 路径
    local PYTHON_BIN=""
    if [ -f "venv/bin/python3" ]; then
        PYTHON_BIN="$BACKEND_DIR/venv/bin/python3"
    elif [ -f "$PROJECT_DIR/venv/bin/python3" ]; then
        PYTHON_BIN="$PROJECT_DIR/venv/bin/python3"
    else
        PYTHON_BIN="python3"
    fi

    # 清空旧日志，方便查看新的启动信息
    echo "=== Backend starting at $(date) ===" > "$LOG_DIR/backend.log"

    # 使用 nohup + 完全后台运行
    nohup "$PYTHON_BIN" -u -m uvicorn main:app \
        --host 0.0.0.0 \
        --port $BACKEND_PORT \
        --workers 1 \
        >> "$LOG_DIR/backend.log" 2>&1 &

    local pid=$!
    echo $pid > "$PID_DIR/backend.pid"

    # 等待并检查是否真正启动
    sleep 3

    if ps -p $pid > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 后端服务已启动 (PID: $pid)${NC}"
        # 显示最后几行日志
        echo -e "${CYAN}启动日志:${NC}"
        tail -5 "$LOG_DIR/backend.log"
    else
        echo -e "${RED}✗ 后端启动失败！${NC}"
        echo -e "${RED}错误日志:${NC}"
        cat "$LOG_DIR/backend.log"
        return 1
    fi
}

start_frontend() {
    echo -e "${BLUE}启动前端服务...${NC}"

    # 确保端口空闲
    kill_port $FRONTEND_PORT
    if ! wait_port_free $FRONTEND_PORT; then
        echo -e "${RED}✗ 端口 $FRONTEND_PORT 被占用，无法启动${NC}"
        return 1
    fi

    cd "$FRONTEND_DIR"

    # 清空旧日志
    echo "=== Frontend starting at $(date) ===" > "$LOG_DIR/frontend.log"

    # 使用 npm run dev 开发模式启动
    nohup npm run dev -- --port $FRONTEND_PORT --host 0.0.0.0 >> "$LOG_DIR/frontend.log" 2>&1 &

    local pid=$!
    echo $pid > "$PID_DIR/frontend.pid"

    sleep 3

    if ps -p $pid > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 前端服务已启动 (PID: $pid)${NC}"
        tail -5 "$LOG_DIR/frontend.log"
    else
        echo -e "${RED}✗ 前端启动失败！${NC}"
        cat "$LOG_DIR/frontend.log"
        return 1
    fi
}

start() {
    echo -e "${CYAN}═══════════════════ 启动服务 ═══════════════════${NC}"
    echo ""
    start_backend
    start_frontend
    echo ""
    echo -e "${GREEN}所有服务已启动！${NC}"
    echo ""
    echo -e "  ${CYAN}后端 API:${NC}  http://localhost:$BACKEND_PORT"
    echo -e "  ${CYAN}前端页面:${NC}  http://localhost:$FRONTEND_PORT"
    echo -e "  ${CYAN}管理后台:${NC}  http://localhost:$FRONTEND_PORT/admin"
    echo ""
    echo -e "${CYAN}═════════════════════════════════════════════════${NC}"
}

stop() {
    echo -e "${CYAN}═══════════════════ 停止服务 ═══════════════════${NC}"
    echo ""
    stop_frontend
    stop_backend
    echo ""
    echo -e "${GREEN}所有服务已停止${NC}"
    echo -e "${CYAN}═════════════════════════════════════════════════${NC}"
}

restart() {
    echo -e "${CYAN}═══════════════════ 重启服务 ═══════════════════${NC}"
    echo ""
    stop_frontend
    stop_backend
    sleep 1
    start_backend
    start_frontend
    echo ""
    echo -e "${GREEN}所有服务已重启！${NC}"
    echo -e "${CYAN}═════════════════════════════════════════════════${NC}"
}

# 简化的日志查看函数 - 使用 tail -f，Ctrl+C 退出
logs_backend() {
    echo -e "${BLUE}后端日志 (按 Ctrl+C 退出):${NC}"
    echo ""
    if [ -f "$LOG_DIR/backend.log" ]; then
        tail -f "$LOG_DIR/backend.log"
    else
        echo -e "${RED}日志文件不存在${NC}"
    fi
}

logs_frontend() {
    echo -e "${BLUE}前端日志 (按 Ctrl+C 退出):${NC}"
    echo ""
    if [ -f "$LOG_DIR/frontend.log" ]; then
        tail -f "$LOG_DIR/frontend.log"
    else
        echo -e "${RED}日志文件不存在${NC}"
    fi
}

db_stats() {
    echo -e "${CYAN}═══════════════════ 数据库统计 ═══════════════════${NC}"
    echo ""

    if [ ! -f "$DB_FILE" ]; then
        echo -e "${RED}数据库文件不存在${NC}"
        return 1
    fi

    echo -e "  ${BLUE}退伍军人总数:${NC}    $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM veterans;")"
    echo -e "  ${GREEN}已验证:${NC}          $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM veterans WHERE status='success';")"
    echo -e "  ${YELLOW}待验证:${NC}          $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM veterans WHERE status='pending';")"
    echo -e "  ${CYAN}邮件已发:${NC}        $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM veterans WHERE status='email_sent';")"
    echo -e "  ${RED}验证失败:${NC}        $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM veterans WHERE status='failed';")"
    echo ""
    echo -e "  ${PURPLE}兑换码总数:${NC}      $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM redeem_codes;")"
    echo -e "  ${GREEN}有效兑换码:${NC}      $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM redeem_codes WHERE is_active=1;")"
    echo -e "  ${BLUE}已使用次数:${NC}      $(sqlite3 "$DB_FILE" "SELECT COALESCE(SUM(used_count), 0) FROM redeem_codes;")"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
}

db_backup() {
    echo -e "${CYAN}备份数据库...${NC}"

    if [ ! -f "$DB_FILE" ]; then
        echo -e "${RED}数据库文件不存在${NC}"
        return 1
    fi

    local backup_name="backup_$(date +%Y%m%d_%H%M%S).db"
    cp "$DB_FILE" "$PROJECT_DIR/$backup_name"
    echo -e "${GREEN}✓ 数据库已备份到: $backup_name${NC}"
}

db_reset() {
    echo -e "${RED}═══════════════════ 危险操作 ═══════════════════${NC}"
    echo ""
    echo -e "${YELLOW}警告: 这将删除所有数据！${NC}"
    echo ""
    read -p "确定要重置数据库吗？请输入 'yes' 确认: " confirm

    if [ "$confirm" = "yes" ]; then
        rm -f "$DB_FILE"
        echo -e "${GREEN}✓ 数据库已重置${NC}"
        echo -e "${YELLOW}请重启后端服务以重新创建数据库${NC}"
    else
        echo -e "${BLUE}操作已取消${NC}"
    fi
}

redeploy() {
    echo -e "${CYAN}═══════════════════ 重新部署 ═══════════════════${NC}"
    echo ""

    # 停止服务
    echo -e "${BLUE}1. 停止现有服务...${NC}"
    stop_frontend
    stop_backend

    # 后端
    echo -e "${BLUE}2. 更新后端依赖...${NC}"
    cd "$BACKEND_DIR"
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -q -r requirements.txt
    echo -e "${GREEN}✓ 后端依赖已更新${NC}"

    # 前端
    echo -e "${BLUE}3. 更新前端依赖并构建...${NC}"
    cd "$FRONTEND_DIR"
    npm install --silent
    npm run build
    echo -e "${GREEN}✓ 前端已构建${NC}"

    # 启动
    echo -e "${BLUE}4. 启动服务...${NC}"
    start_backend
    start_frontend

    echo ""
    echo -e "${GREEN}═══════════════════ 部署完成 ═══════════════════${NC}"
}

update() {
    echo -e "${CYAN}═══════════════════ 更新系统 ═══════════════════${NC}"
    echo ""

    # 检查是否是 git 仓库
    if [ ! -d "$PROJECT_DIR/.git" ]; then
        echo -e "${RED}错误: 当前目录不是 Git 仓库${NC}"
        return 1
    fi

    # 停止服务
    echo -e "${BLUE}1. 停止现有服务...${NC}"
    stop_frontend
    stop_backend

    # 拉取最新代码
    echo -e "${BLUE}2. 拉取最新代码...${NC}"
    cd "$PROJECT_DIR"
    git pull
    if [ $? -ne 0 ]; then
        echo -e "${RED}Git pull 失败，请检查网络或解决冲突${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ 代码已更新${NC}"

    # 更新后端依赖
    echo -e "${BLUE}3. 更新后端依赖...${NC}"
    cd "$BACKEND_DIR"
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -q -r requirements.txt
    echo -e "${GREEN}✓ 后端依赖已更新${NC}"

    # 更新前端依赖并构建
    echo -e "${BLUE}4. 更新前端依赖并构建...${NC}"
    cd "$FRONTEND_DIR"
    npm install --silent
    npm run build
    echo -e "${GREEN}✓ 前端已构建${NC}"

    # 启动服务
    echo -e "${BLUE}5. 启动服务...${NC}"
    start_backend
    start_frontend

    echo ""
    echo -e "${GREEN}═══════════════════ 更新完成 ═══════════════════${NC}"
}

show_help() {
    show_logo
    echo -e "${GREEN}用法: ./manage.sh [命令]${NC}"
    echo ""
    echo "命令:"
    echo "  status, s         查看服务状态"
    echo "  start             启动所有服务"
    echo "  stop              停止所有服务"
    echo "  restart, r        重启所有服务"
    echo "  logs, l           查看后端日志"
    echo "  logs-frontend, lf 查看前端日志"
    echo "  db-stats, ds      查看数据库统计"
    echo "  db-backup, db     备份数据库"
    echo "  db-reset          重置数据库"
    echo "  redeploy, rd      重新部署"
    echo "  update, u         更新系统 (git pull + 重建)"
    echo "  help, h           显示帮助"
    echo ""
    echo "示例:"
    echo "  ./manage.sh start     # 启动所有服务"
    echo "  ./manage.sh status    # 查看状态"
    echo "  ./manage.sh           # 进入交互式菜单"
    echo ""
}

# 命令行参数处理
case "$1" in
    status|s)
        status
        exit 0
        ;;
    start)
        start
        exit 0
        ;;
    stop)
        stop
        exit 0
        ;;
    restart|r)
        restart
        exit 0
        ;;
    logs|l)
        logs_backend
        exit 0
        ;;
    logs-frontend|lf)
        logs_frontend
        exit 0
        ;;
    db-stats|ds)
        db_stats
        exit 0
        ;;
    db-backup|db)
        db_backup
        exit 0
        ;;
    db-reset)
        db_reset
        exit 0
        ;;
    redeploy|rd)
        redeploy
        exit 0
        ;;
    update|u)
        update
        exit 0
        ;;
    help|h|--help|-h)
        show_help
        exit 0
        ;;
esac

# 无参数时显示交互式菜单
clear
show_logo

while true; do
    show_menu
    read -p "请输入选项 [0-11]: " choice
    echo ""

    case $choice in
        1) status ;;
        2) start ;;
        3) stop ;;
        4) restart ;;
        5) logs_backend ;;
        6) logs_frontend ;;
        7) db_stats ;;
        8) db_backup ;;
        9) db_reset ;;
        10) redeploy ;;
        11) update ;;
        0)
            echo -e "${GREEN}再见！${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}无效选项，请重新选择${NC}"
            ;;
    esac

    echo ""
    read -p "按回车继续..."
    clear
    show_logo
done
