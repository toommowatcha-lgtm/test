import React from 'react';
import { CheckCircle, RefreshCw, AlertTriangle } from 'lucide-react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ToastProps {
    status: SaveStatus;
    message?: string;
}

const Toast: React.FC<ToastProps> = ({ status, message }) => {
    const getStatusInfo = () => {
        switch (status) {
            case 'saving':
                return { icon: <RefreshCw className="w-5 h-5 mr-2 animate-spin" />, text: 'Saving...', classes: 'bg-accent text-text-secondary', visible: true };
            case 'saved':
                return { icon: <CheckCircle className="w-5 h-5 mr-2" />, text: 'Saved ✓', classes: 'bg-success text-white', visible: true };
            case 'error':
                return { icon: <AlertTriangle className="w-5 h-5 mr-2" />, text: message || 'Save failed', classes: 'bg-danger text-white', visible: true };
            default:
                return { visible: false };
        }
    };

    const statusInfo = getStatusInfo();

    if (!statusInfo.visible) {
        return null;
    }

    return (
        <div className={`fixed bottom-8 right-8 z-50 flex items-center p-4 rounded-lg shadow-lg transition-all duration-300 transform-gpu ${statusInfo.classes} ${statusInfo.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {statusInfo.icon}
            <span className="font-semibold">{statusInfo.text}</span>
        </div>
    );
};

export default Toast;
