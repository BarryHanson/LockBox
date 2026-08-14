"use client"

import React from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ShieldAlert } from 'lucide-react'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  message?: string | null
}

export default function UpgradeModal({ open, onClose, message }: UpgradeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
      <DialogContent className="w-full max-w-2xl mx-4">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-md bg-amber-100 text-amber-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <DialogTitle>Upgrade Required</DialogTitle>
          </div>
          <DialogDescription>
            <p className="text-sm text-muted-foreground mb-4">{message ?? 'Free users are limited to 50 passwords. Upgrade to PRO for unlimited passwords.'}</p>
            <div className="flex gap-3">
              <Link href="/vault/account">
                <Button className="bg-primary hover:bg-primary-hover text-white">Upgrade to PRO</Button>
              </Link>
              <Button variant="outline" onClick={onClose}>Maybe Later</Button>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
