import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const ModalUser: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-gray-800/50">
      <div className="flex min-h-full items-start justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
        <div className="relative z-[201] max-w-full rounded-lg bg-white p-2 shadow-lg">

          {/*
          <button 
            onClick={onClose} 
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
          >
            &times;
          </button>
          */}
          {children}
        </div>
      </div>
    </div>
  );
};

export default ModalUser;
