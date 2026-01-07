import { motion, AnimatePresence } from 'framer-motion';
import { Activity, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import type { LogEntry } from '../hooks/useVerification';

interface StatusPanelProps {
  logs: LogEntry[];
  status: string;
  message: string | null;
  error: string | null;
}

const statusConfig = {
  idle: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10' },
  getting_veteran: { icon: Activity, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  submitting_step1: { icon: Activity, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  awaiting_email: { icon: AlertCircle, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  submitting_step2: { icon: Activity, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  success: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
};

const logTypeConfig = {
  info: { color: 'text-gray-400', dot: 'bg-gray-400' },
  success: { color: 'text-emerald-400', dot: 'bg-emerald-400' },
  error: { color: 'text-red-400', dot: 'bg-red-400' },
  warning: { color: 'text-amber-400', dot: 'bg-amber-400' },
};

export default function StatusPanel({
  logs,
  status,
  message,
  error,
}: StatusPanelProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.idle;
  const StatusIcon = config.icon;

  return (
    <div className="h-full flex flex-col">
      {/* 状态卡片 */}
      <div className={`p-4 rounded-xl ${config.bg} border border-white/10 mb-4`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center`}>
            <StatusIcon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div className="flex-1">
            <p className={`font-medium ${config.color}`}>
              {status === 'idle' && '等待提交'}
              {status === 'getting_veteran' && '获取验证数据...'}
              {status === 'submitting_step1' && '正在提交验证...'}
              {status === 'awaiting_email' && '等待邮件验证'}
              {status === 'submitting_step2' && '正在完成验证...'}
              {status === 'success' && '验证成功'}
              {status === 'failed' && '验证失败'}
            </p>
            {message && status !== 'failed' && (
              <p className="text-sm text-gray-400 mt-0.5">{message}</p>
            )}
            {error && (
              <p className="text-sm text-red-400 mt-0.5">{error}</p>
            )}
          </div>
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-1 bg-white/5 rounded-full mb-4 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
          initial={{ width: '0%' }}
          animate={{
            width:
              status === 'idle' ? '0%' :
              status === 'getting_veteran' ? '20%' :
              status === 'submitting_step1' ? '40%' :
              status === 'awaiting_email' ? '60%' :
              status === 'submitting_step2' ? '80%' :
              status === 'success' ? '100%' :
              status === 'failed' ? '100%' : '0%',
          }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* 日志列表 */}
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-500">活动日志</span>
          <span className="text-xs text-gray-600 ml-auto">{logs.length} 条</span>
        </div>

        <div className="h-[calc(100%-2rem)] overflow-y-auto space-y-1 pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <AnimatePresence mode="popLayout">
            {logs.map((log) => {
              const typeConfig = logTypeConfig[log.type] || logTypeConfig.info;
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: 20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0"
                >
                  <span className="text-xs font-mono text-gray-600 w-16 flex-shrink-0">
                    {log.time}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full ${typeConfig.dot} mt-1.5 flex-shrink-0`} />
                  <span className={`text-sm ${typeConfig.color} break-all`}>
                    {log.message}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {logs.length === 0 && (
            <div className="text-center text-gray-600 text-sm py-8">
              暂无活动记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
