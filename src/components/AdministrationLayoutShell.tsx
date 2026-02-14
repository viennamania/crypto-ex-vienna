'use client';

import { useState, type ReactNode } from 'react';
import AdministrationSidebar from '@/components/AdministrationSidebar';
import AdminSupportChatWidget from '@/components/AdminSupportChatWidget';

type AdministrationLayoutShellProps = {
  lang: string;
  children: ReactNode;
};

export default function AdministrationLayoutShell({ lang, children }: AdministrationLayoutShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-800">
      <AdministrationSidebar
        lang={lang}
        isOpen={isSidebarOpen}
        onOpenChange={setIsSidebarOpen}
      />
      <div
        className={`min-h-screen transition-[padding] duration-300 ease-out ${
          isSidebarOpen ? 'lg:pl-[280px]' : 'lg:pl-0'
        }`}
      >
        {children}
      </div>
      <AdminSupportChatWidget />
    </div>
  );
}

