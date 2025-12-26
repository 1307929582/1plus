#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${PURPLE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     SheerID Veteran Verification Tool - Installer         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

INSTALL_DIR="/opt/sheerid"

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 root 权限运行: sudo bash -c \"\$(curl -fsSL URL)\"${NC}"
    exit 1
fi

# 检查依赖
echo -e "${BLUE}[1/5] 检查系统依赖...${NC}"

check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}缺少 $1，请先安装${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ $1${NC}"
}

check_cmd git
check_cmd python3
check_cmd node
check_cmd npm

# 克隆项目
echo -e "${BLUE}[2/5] 下载项目...${NC}"
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}目录已存在，更新代码...${NC}"
    cd "$INSTALL_DIR"
    git pull
else
    git clone https://github.com/1307929582/1plus.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi
echo -e "${GREEN}  ✓ 项目已下载到 $INSTALL_DIR${NC}"

# 设置权限
chmod +x deploy.sh manage.sh

# 运行部署
echo -e "${BLUE}[3/5] 安装依赖...${NC}"
./deploy.sh

# 注册全局命令
echo -e "${BLUE}[4/5] 注册全局命令...${NC}"
ln -sf "$INSTALL_DIR/manage.sh" /usr/local/bin/sheerid
echo -e "${GREEN}  ✓ 已注册命令: sheerid${NC}"

# 启动服务
echo -e "${BLUE}[5/5] 启动服务...${NC}"
./manage.sh start

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    安装完成！                              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}管理命令:${NC}    sheerid"
echo -e "  ${CYAN}前端地址:${NC}    http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):5173"
echo -e "  ${CYAN}管理后台:${NC}    http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):5173/admin"
echo -e "  ${CYAN}API地址:${NC}     http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):8000"
echo ""
echo -e "  ${YELLOW}默认账号:${NC}    admin / admin123"
echo ""
