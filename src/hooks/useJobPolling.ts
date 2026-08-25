import { useState, useEffect, useCallback, useRef } from 'react';

export type JobStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error';

interface UseJobPollingProps {
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  toastService?: {
    showToast: (msg: string, type?: string) => void;
  };
}

export function useJobPolling({ onSuccess, onError, onCancel, toastService }: UseJobPollingProps = {}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const checkJobStatus = useCallback(async (currentJobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${currentJobId}`);
      if (!res.ok) {
        throw new Error(`Server returned error status ${res.status}`);
      }
      const result = await res.json();
      if (result.success && result.data) {
        const { status: jobStatus, progressLog, errorMessage: jobErr, meta, progressPercent: dbProgress } = result.data;
        
        setStatus(jobStatus);
        setLogs(progressLog || []);

        if (dbProgress !== undefined && dbProgress !== null && dbProgress > 0) {
          setProgressPercent(dbProgress);
        } else if (jobStatus === 'processing') {
          const currentStep = progressLog ? progressLog.length : 0;
          const maxSteps = meta?.removeWatermark ? 6 : 5;
          setProgressPercent(Math.min(95, Math.round((currentStep / maxSteps) * 100)));
        }

        if (jobStatus === 'done') {
          setProgressPercent(100);
          clearPolling();
          if (toastService) {
            toastService.showToast('Đã xử lý xong tác vụ!', 'success');
          }
          if (onSuccess) {
            onSuccess(result.data);
          }
        } else if (jobStatus === 'error') {
          clearPolling();
          const finalErr = jobErr || 'Lỗi xử lý file media';
          setErrorMessage(finalErr);
          if (toastService) {
            toastService.showToast(finalErr, 'error');
          }
          if (onError) {
            onError(finalErr);
          }
        }
      }
    } catch (err: any) {
      console.error('Error polling job status:', err);
    }
  }, [clearPolling, onSuccess, onError, toastService]);

  const startPolling = useCallback((newJobId: string) => {
    setJobId(newJobId);
    setStatus('queued');
    setLogs([]);
    setErrorMessage('');
    setProgressPercent(0);

    clearPolling();
    checkJobStatus(newJobId);
    
    pollIntervalRef.current = setInterval(() => {
      checkJobStatus(newJobId);
    }, 2000);
  }, [clearPolling, checkJobStatus]);

  const cancelJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (toastService) {
          toastService.showToast('Đã huỷ Job và xoá file tạm', 'info');
        }
        clearPolling();
        setJobId(null);
        setStatus('idle');
        if (onCancel) {
          onCancel();
        }
      }
    } catch (e) {
      console.error('Error canceling job:', e);
    }
  }, [jobId, clearPolling, onCancel, toastService]);

  const retryJob = useCallback(async () => {
    if (!jobId) return;
    setStatus('queued');
    setErrorMessage('');
    setLogs((prev) => [...prev, '[System] Đang gửi yêu cầu thử lại...']);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'POST'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Không thể chạy lại');
      }
      // Re-trigger polling
      clearPolling();
      pollIntervalRef.current = setInterval(() => {
        checkJobStatus(jobId);
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Lỗi gọi lệnh retry');
      if (toastService) {
        toastService.showToast(err.message || 'Lỗi chạy lại', 'error');
      }
    }
  }, [jobId, clearPolling, checkJobStatus, toastService]);

  useEffect(() => {
    return () => clearPolling();
  }, [clearPolling]);

  return {
    jobId,
    status,
    logs,
    errorMessage,
    progressPercent,
    startPolling,
    cancelJob,
    retryJob,
    setJobId,
    setStatus,
    setProgressPercent,
    setLogs,
    setErrorMessage
  };
}
