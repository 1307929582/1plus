#!/bin/bash

# 诊断脚本 - 检查 SheerID 验证工具问题

echo "========== 诊断开始 =========="
echo ""

# 1. 检查 Git 状态
echo "1. Git 状态:"
git log --oneline -3
echo ""

# 2. 检查后端代码是否包含 DEBUG
echo "2. 检查后端代码是否有 DEBUG 语句:"
grep -c "\[DEBUG\]" backend/main.py && echo "✓ DEBUG 语句存在" || echo "✗ DEBUG 语句不存在"
echo ""

# 3. 检查数据库
echo "3. 数据库状态:"
DB_FILE="backend/sheerid_veteran.db"
if [ -f "$DB_FILE" ]; then
    echo "  - PENDING veterans: $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM veterans WHERE status='PENDING';")"
    echo "  - EMAIL_SENT veterans: $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM veterans WHERE status='EMAIL_SENT';")"
    echo "  - Active codes: $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM redeem_codes WHERE is_active=1;")"
    echo "  - Codes with remaining uses: $(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM redeem_codes WHERE is_active=1 AND used_count < total_uses;")"
    echo ""
    echo "  兑换码列表:"
    sqlite3 "$DB_FILE" "SELECT code, is_active, used_count, total_uses FROM redeem_codes LIMIT 5;"
else
    echo "  ✗ 数据库文件不存在"
fi
echo ""

# 4. 检查进程
echo "4. 运行中的进程:"
ps aux | grep -E "uvicorn|vite|npm" | grep -v grep || echo "  没有找到相关进程"
echo ""

# 5. 测试 API
echo "5. 测试 API (需要服务运行):"
if command -v curl &> /dev/null; then
    echo "  测试 get-veteran API..."
    # 获取第一个有效的兑换码
    CODE=$(sqlite3 "$DB_FILE" "SELECT code FROM redeem_codes WHERE is_active=1 AND used_count < total_uses LIMIT 1;" 2>/dev/null)
    if [ -n "$CODE" ]; then
        echo "  使用兑换码: $CODE"
        RESPONSE=$(curl -s -X POST http://localhost:14100/api/verify/get-veteran \
            -H "Content-Type: application/json" \
            -d "{\"code\":\"$CODE\"}" 2>/dev/null)
        echo "  响应: $RESPONSE"
    else
        echo "  ✗ 没有可用的兑换码"
    fi
else
    echo "  curl 不可用"
fi
echo ""

echo "========== 诊断结束 =========="
